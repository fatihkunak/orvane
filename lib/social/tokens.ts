import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { resolveCredentials } from "@/lib/social/app-credentials";
import { OAuthError, providerFor, refreshTokenSet, type TokenSet } from "@/lib/social/providers";

/** Thrown when a token is dead and only the user can fix it by connecting the account again. */
export class ReconnectRequiredError extends Error {
  constructor(platform: string) {
    super(`${platform} bağlantısının süresi doldu, hesabı yeniden bağla`);
    this.name = "ReconnectRequiredError";
  }
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export async function saveTokens(accountId: string, tokens: TokenSet) {
  return prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encrypt(tokens.accessToken),
      // Keep the old refresh token when the provider did not send a new one
      ...(tokens.refreshToken ? { refreshToken: encrypt(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt ?? null,
      ...(tokens.scopes?.length ? { scopes: tokens.scopes } : {}),
    },
  });
}

/** True when the token should be refreshed now, following each platform's rules. */
export function needsRefresh(
  slug: "twitter" | "linkedin" | "threads",
  a: { expiresAt: Date | null; updatedAt: Date; hasRefreshToken: boolean },
  now = Date.now(),
): boolean {
  if (!a.expiresAt) return false;
  const left = a.expiresAt.getTime() - now;
  if (slug === "twitter") return left < 5 * MINUTE; // 2-hour tokens
  if (slug === "linkedin") return a.hasRefreshToken && left < 7 * DAY;
  // Threads: refresh within the last 7 days, but never a token younger than 24h (API rule)
  return left < 7 * DAY && now - a.updatedAt.getTime() > DAY;
}

/**
 * Returns a usable access token for a connected account, refreshing it first when needed.
 * Refresh tokens (X) are single-use, so if two jobs race, the loser re-reads the winner's result.
 */
export async function getAccessToken(accountId: string): Promise<{ accessToken: string; platformUserId: string }> {
  let account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  const provider = providerFor(account.provider);

  const expired = account.expiresAt !== null && account.expiresAt.getTime() <= Date.now();
  if (needsRefresh(provider.slug, { ...account, hasRefreshToken: !!account.refreshToken })) {
    try {
      // The app the account was connected with: the user's own X app, or Orvane's for the other platforms
      const creds = await resolveCredentials(account.userId, provider.slug);
      const fresh = await refreshTokenSet(
        provider.slug,
        { accessToken: decrypt(account.accessToken), refreshToken: account.refreshToken ? decrypt(account.refreshToken) : null },
        creds,
      );
      account = await saveTokens(account.id, fresh);
    } catch (e) {
      // Another job may have refreshed (and rotated) the token while we were trying
      const latest = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
      const rotatedByOther = latest.updatedAt.getTime() !== account.updatedAt.getTime();
      if (rotatedByOther) account = latest;
      else if (expired) {
        // Only a provider rejection (4xx) means the user must reconnect; network errors and 5xx stay retryable
        const rejected = e instanceof OAuthError && e.status >= 400 && e.status < 500 && e.status !== 429;
        if (rejected) throw new ReconnectRequiredError(provider.label);
        throw e;
      }
      else console.warn(`token refresh failed for ${provider.label}, using the current token`, e);
    }
  } else if (expired) {
    throw new ReconnectRequiredError(provider.label);
  }

  return { accessToken: decrypt(account.accessToken), platformUserId: account.platformUserId };
}
