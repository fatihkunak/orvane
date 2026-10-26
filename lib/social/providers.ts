import { createHash, randomBytes } from "node:crypto";
import type { Platform } from "@/generated/prisma/enums";

/**
 * OAuth 2.0 client for the three platforms. Plain fetch, no SDKs, so every request is visible here.
 * Endpoints verified against the official docs (Oct 2026):
 *  - X:        https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
 *  - LinkedIn: https://learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow
 *  - Threads:  https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 */

export type ProviderSlug = "twitter" | "linkedin" | "threads";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  /** Threads returns the user id together with the token */
  userId?: string;
};

export type Profile = {
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type ProviderConfig = {
  slug: ProviderSlug;
  platform: Platform;
  label: string;
  authorizeUrl: string;
  scopes: string[];
  scopeSeparator: " " | ",";
  pkce: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
};

export const PROVIDERS: Record<ProviderSlug, ProviderConfig> = {
  twitter: {
    slug: "twitter",
    platform: "TWITTER",
    label: "X",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    // offline.access → refresh token; media.write → media upload; tweet.read is required by POST /2/tweets
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    scopeSeparator: " ",
    pkce: true,
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
  },
  linkedin: {
    slug: "linkedin",
    platform: "LINKEDIN",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    // openid+profile → /v2/userinfo (id, name, picture); w_member_social → create posts
    scopes: ["openid", "profile", "w_member_social"],
    scopeSeparator: " ",
    pkce: false,
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  threads: {
    slug: "threads",
    platform: "THREADS",
    label: "Threads",
    authorizeUrl: "https://threads.com/oauth/authorize",
    scopes: ["threads_basic", "threads_content_publish"],
    scopeSeparator: ",",
    pkce: false,
    clientIdEnv: "THREADS_APP_ID",
    clientSecretEnv: "THREADS_APP_SECRET",
  },
};

export function isProviderSlug(v: string): v is ProviderSlug {
  return v in PROVIDERS;
}

export function credentials(slug: ProviderSlug): { clientId: string; clientSecret: string } | null {
  const p = PROVIDERS[slug];
  const clientId = process.env[p.clientIdEnv];
  const clientSecret = process.env[p.clientSecretEnv];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function providerFor(platform: Platform): ProviderConfig {
  return Object.values(PROVIDERS).find((p) => p.platform === platform)!;
}

// ---------------------------------------------------------------------------
// PKCE + state
// ---------------------------------------------------------------------------

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

type Creds = { clientId: string; clientSecret: string };

export function buildAuthorizeUrl(
  slug: ProviderSlug,
  opts: { state: string; redirectUri: string; codeChallenge?: string; creds?: Creds | null },
): string {
  const p = PROVIDERS[slug];
  const creds = opts.creds ?? credentials(slug);
  if (!creds) throw new Error(`${p.label} is not configured`);

  const url = new URL(p.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", p.scopes.join(p.scopeSeparator));
  url.searchParams.set("state", opts.state);
  if (p.pkce && opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token endpoints
// ---------------------------------------------------------------------------

/**
 * Provider calls must not hang: a token refresh runs under a per-account lock (see tokens.ts), so a stuck request would
 * block every other job of that account. Must stay below the lock transaction's own timeout.
 */
const OAUTH_TIMEOUT_MS = 15_000;

async function postForm(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = (json.error_description ?? json.error ?? json.detail ?? res.statusText) as string;
    throw new OAuthError(`${url} → ${res.status} ${detail}`, res.status);
  }
  return json;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

const basicAuth = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
const inSeconds = (s: unknown) => (typeof s === "number" ? new Date(Date.now() + s * 1000) : null);

function toTokenSet(json: Record<string, unknown>): TokenSet {
  return {
    accessToken: json.access_token as string,
    refreshToken: (json.refresh_token as string | undefined) ?? null,
    expiresAt: inSeconds(json.expires_in),
    scopes: typeof json.scope === "string" ? json.scope.split(/[ ,]+/).filter(Boolean) : undefined,
  };
}

export async function exchangeCode(
  slug: ProviderSlug,
  opts: { code: string; redirectUri: string; codeVerifier?: string; creds?: Creds | null },
): Promise<TokenSet> {
  const creds = opts.creds ?? credentials(slug);
  if (!creds) throw new Error(`${slug} is not configured`);

  if (slug === "twitter") {
    // Confidential client: credentials go in the Basic auth header
    const json = await postForm(
      "https://api.x.com/2/oauth2/token",
      {
        code: opts.code,
        grant_type: "authorization_code",
        redirect_uri: opts.redirectUri,
        code_verifier: opts.codeVerifier ?? "",
      },
      { Authorization: basicAuth(creds.clientId, creds.clientSecret) },
    );
    return toTokenSet(json);
  }

  if (slug === "linkedin") {
    const json = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "authorization_code",
      code: opts.code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: opts.redirectUri,
    });
    return toTokenSet(json);
  }

  // Threads: short-lived token (~1h) first, then swap it for a long-lived one (60 days)
  const short = await postForm("https://graph.threads.com/oauth/access_token", {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code: opts.code,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
  });
  const exchange = new URL("https://graph.threads.com/access_token");
  exchange.searchParams.set("grant_type", "th_exchange_token");
  exchange.searchParams.set("client_secret", creds.clientSecret);
  exchange.searchParams.set("access_token", short.access_token as string);
  const long = await getJson(exchange.toString());
  return {
    accessToken: long.access_token as string,
    refreshToken: null, // Threads refreshes the access token itself
    expiresAt: inSeconds(long.expires_in),
    scopes: PROVIDERS.threads.scopes,
    userId: String(short.user_id),
  };
}

export async function refreshTokenSet(
  slug: ProviderSlug,
  current: { accessToken: string; refreshToken: string | null },
  credsOverride?: Creds | null,
): Promise<TokenSet> {
  const creds = credsOverride ?? credentials(slug);
  if (!creds) throw new Error(`${slug} is not configured`);

  if (slug === "twitter") {
    if (!current.refreshToken) throw new OAuthError("No refresh token stored", 400);
    // X rotates refresh tokens: the response carries a NEW one that must be saved
    const json = await postForm(
      "https://api.x.com/2/oauth2/token",
      { refresh_token: current.refreshToken, grant_type: "refresh_token" },
      { Authorization: basicAuth(creds.clientId, creds.clientSecret) },
    );
    return toTokenSet(json);
  }

  if (slug === "linkedin") {
    if (!current.refreshToken) throw new OAuthError("No refresh token stored (LinkedIn only issues them to approved apps)", 400);
    const json = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });
    return { ...toTokenSet(json), refreshToken: (json.refresh_token as string | undefined) ?? current.refreshToken };
  }

  const url = new URL("https://graph.threads.com/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", current.accessToken);
  const json = await getJson(url.toString());
  return { accessToken: json.access_token as string, refreshToken: null, expiresAt: inSeconds(json.expires_in) };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | string | undefined;
    // X v2 errors carry `detail`/`reason` at the top level instead of `error.message`.
    const detail = typeof err === "string" ? err : (err?.message ?? json.message ?? json.detail ?? json.reason ?? res.statusText);
    throw new OAuthError(`${new URL(url).origin}${new URL(url).pathname} → ${res.status} ${String(detail)}`, res.status);
  }
  return json;
}

export async function fetchProfile(slug: ProviderSlug, tokens: TokenSet): Promise<Profile> {
  if (slug === "twitter") {
    const json = await getJson("https://api.x.com/2/users/me?user.fields=profile_image_url,username,name", {
      Authorization: `Bearer ${tokens.accessToken}`,
    });
    const d = json.data as { id: string; username?: string; name?: string; profile_image_url?: string };
    return { platformUserId: d.id, username: d.username ?? null, displayName: d.name ?? null, avatarUrl: d.profile_image_url ?? null };
  }

  if (slug === "linkedin") {
    // OpenID Connect userinfo: `sub` is the member id used in urn:li:person:<sub>
    const d = (await getJson("https://api.linkedin.com/v2/userinfo", {
      Authorization: `Bearer ${tokens.accessToken}`,
    })) as { sub: string; name?: string; picture?: string };
    return { platformUserId: d.sub, username: null, displayName: d.name ?? null, avatarUrl: d.picture ?? null };
  }

  const url = new URL("https://graph.threads.com/v1.0/me");
  url.searchParams.set("fields", "id,username,name,threads_profile_picture_url");
  url.searchParams.set("access_token", tokens.accessToken);
  const d = (await getJson(url.toString())) as { id: string; username?: string; name?: string; threads_profile_picture_url?: string };
  return { platformUserId: d.id, username: d.username ?? null, displayName: d.name ?? null, avatarUrl: d.threads_profile_picture_url ?? null };
}
