import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { PROVIDERS, credentials, type ProviderSlug } from "@/lib/social/providers";

/**
 * Whose developer app is used to talk to a platform. LinkedIn and Threads use Orvane's own app (free to call, but each needs the
 * platform's review). X is different: it bills API usage to the app owner, so every user brings their OWN X app and the costs stay
 * with them. Orvane's own X keys in the environment are used only when `SHARED_X_APP=1`, which is meant for a private, single-owner
 * install; leave it off on anything other people can sign in to.
 */
export const BRING_YOUR_OWN: ReadonlySet<ProviderSlug> = new Set<ProviderSlug>(["twitter"]);

export type AppCredentials = { clientId: string; clientSecret: string; source: "own" | "shared" };

export const sharedXAllowed = () => process.env.SHARED_X_APP === "1";

const MAX_LEN = 200;

export class AppCredentialError extends Error {}

/** The app credentials to use for this user and platform, or null when none are configured. */
export async function resolveCredentials(userId: string, slug: ProviderSlug): Promise<AppCredentials | null> {
  if (!BRING_YOUR_OWN.has(slug)) {
    const env = credentials(slug);
    return env ? { ...env, source: "shared" } : null;
  }
  const row = await prisma.socialAppCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDERS[slug].platform } } });
  if (row) {
    try {
      return { clientId: row.clientId, clientSecret: decrypt(row.clientSecret), source: "own" };
    } catch {
      return null; // TOKEN_ENCRYPTION_KEY changed: treated as "not configured", the user enters the keys again
    }
  }
  const env = sharedXAllowed() ? credentials(slug) : null;
  return env ? { ...env, source: "shared" } : null;
}

export interface AppCredentialStatus {
  /** Whether the user saved their own keys */
  hasOwn: boolean;
  /** Start of the client id, enough to recognise it (the id is not secret, the secret is never returned) */
  clientIdHint: string | null;
  /** Whether Orvane's own keys would be used (private install only) */
  sharedAvailable: boolean;
}

export async function credentialStatus(userId: string, slug: ProviderSlug): Promise<AppCredentialStatus> {
  const row = await prisma.socialAppCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDERS[slug].platform } }, select: { clientId: true } });
  return { hasOwn: !!row, clientIdHint: row ? `${row.clientId.slice(0, 4)}…` : null, sharedAvailable: BRING_YOUR_OWN.has(slug) && sharedXAllowed() && !!credentials(slug) };
}

const clean = (v: string) => v.trim();

export async function saveOwnCredentials(userId: string, slug: ProviderSlug, clientIdRaw: string, clientSecretRaw: string): Promise<void> {
  if (!BRING_YOUR_OWN.has(slug)) throw new AppCredentialError("Bu platform için kendi anahtarını girmen gerekmiyor.");
  const clientId = clean(clientIdRaw);
  const clientSecret = clean(clientSecretRaw);
  if (!clientId || !clientSecret) throw new AppCredentialError("Client ID ve Client Secret gerekli.");
  if (clientId.length > MAX_LEN || clientSecret.length > MAX_LEN) throw new AppCredentialError("Anahtar çok uzun.");
  if (/\s/.test(clientId) || /\s/.test(clientSecret)) throw new AppCredentialError("Anahtarlarda boşluk olamaz.");

  const provider = PROVIDERS[slug].platform;
  await prisma.socialAppCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, clientId, clientSecret: encrypt(clientSecret) },
    update: { clientId, clientSecret: encrypt(clientSecret) },
  });
}

/** Removes the user's own app keys. Refused while an account connected with them exists: it could no longer refresh its token. */
export async function removeOwnCredentials(userId: string, slug: ProviderSlug): Promise<boolean> {
  const provider = PROVIDERS[slug].platform;
  const connected = await prisma.socialAccount.count({ where: { userId, provider } });
  if (connected > 0) throw new AppCredentialError("Önce bu platformdaki bağlı hesabı kes, sonra anahtarları kaldır.");
  const { count } = await prisma.socialAppCredential.deleteMany({ where: { userId, provider } });
  return count > 0;
}
