import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  PROVIDERS,
  buildAuthorizeUrl,
  credentials,
  exchangeCode,
  fetchProfile,
  isProviderSlug,
  pkceChallenge,
  randomToken,
  type ProviderSlug,
} from "@/lib/social/providers";

const COOKIE_MAX_AGE = 10 * 60; // the user has 10 minutes to finish the consent screen

/** Public base URL used to build redirect URIs; must match what is registered at each platform. */
export function baseUrl(req: Request): string {
  return process.env.APP_URL ?? process.env.AUTH_URL ?? new URL(req.url).origin;
}

const cookieName = (slug: ProviderSlug) => `postforge_oauth_${slug}`;
const redirectUriFor = (req: Request, slug: ProviderSlug) => `${baseUrl(req)}/api/connect/${slug}/callback`;
const back = (req: Request, query: string) => NextResponse.redirect(new URL(`/accounts?${query}`, baseUrl(req)));

/** Step 1: send the user to the platform's consent screen. */
export async function startConnect(req: Request, provider: string) {
  if (!isProviderSlug(provider)) return new NextResponse("Not found", { status: 404 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", baseUrl(req)));
  if (!credentials(provider)) return back(req, `error=not_configured&provider=${provider}`);

  const state = randomToken(24);
  const verifier = PROVIDERS[provider].pkce ? randomToken(48) : undefined;

  const res = NextResponse.redirect(
    buildAuthorizeUrl(provider, {
      state,
      redirectUri: redirectUriFor(req, provider),
      codeChallenge: verifier ? pkceChallenge(verifier) : undefined,
    }),
  );
  // httpOnly + Lax: sent back on the platform's top-level redirect, invisible to page scripts
  res.cookies.set(cookieName(provider), JSON.stringify({ state, verifier, userId: session.user.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl(req).startsWith("https://"),
    path: "/api/connect",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

/** Step 2: the platform redirects back with ?code&state; exchange it and store the account. */
export async function finishConnect(req: Request, provider: string) {
  if (!isProviderSlug(provider)) return new NextResponse("Not found", { status: 404 });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", baseUrl(req)));

  const url = new URL(req.url);
  const raw = req.headers.get("cookie")?.match(new RegExp(`${cookieName(provider)}=([^;]+)`))?.[1];
  let saved: { state: string; verifier?: string; userId: string } | null = null;
  try {
    saved = raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    saved = null;
  }

  const clear = (r: NextResponse) => {
    r.cookies.set(cookieName(provider), "", { path: "/api/connect", maxAge: 0 });
    return r;
  };

  if (url.searchParams.get("error")) return clear(back(req, `error=denied&provider=${provider}`));

  // CSRF defence: state must match the cookie set in startConnect, and belong to the same user
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!saved || !state || saved.state !== state || saved.userId !== session.user.id || !code) {
    return clear(back(req, `error=invalid_state&provider=${provider}`));
  }

  try {
    const tokens = await exchangeCode(provider, {
      code,
      redirectUri: redirectUriFor(req, provider),
      codeVerifier: saved.verifier,
    });
    const profile = await fetchProfile(provider, tokens);
    const platform = PROVIDERS[provider].platform;

    const data = {
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes ?? PROVIDERS[provider].scopes,
    };
    await prisma.socialAccount.upsert({
      where: {
        userId_provider_platformUserId: { userId: session.user.id, provider: platform, platformUserId: profile.platformUserId },
      },
      create: { userId: session.user.id, provider: platform, platformUserId: profile.platformUserId, ...data },
      update: data,
    });
    return clear(back(req, `connected=${provider}`));
  } catch (e) {
    console.error(`OAuth callback failed for ${provider}`, e);
    return clear(back(req, `error=failed&provider=${provider}`));
  }
}
