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

/** `prisma` itself or a transaction client: saving inside the refresh lock must use the lock's transaction. */
type AccountDb = Pick<typeof prisma, "socialAccount">;

export async function saveTokens(accountId: string, tokens: TokenSet, db: AccountDb = prisma) {
  return db.socialAccount.update({
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

type Account = Awaited<ReturnType<typeof prisma.socialAccount.findUniqueOrThrow>>;

const isExpired = (a: Account) => a.expiresAt !== null && a.expiresAt.getTime() <= Date.now();

/**
 * Refreshes one account's token under a Postgres advisory lock, so only one job per account talks to the provider at a time.
 * X refresh tokens are single use: without the lock two jobs send the same one, the second is rejected, and when the first
 * has not saved the new token yet the loser has nothing to fall back on. A job that waited for the lock re-reads the row and
 * finds the token already refreshed, so it never sends the used refresh token again. The lock is transaction-scoped: it is
 * released on commit or rollback, also when the process dies, and it works across several app instances.
 * Provider failures are returned, not thrown, so the transaction ends cleanly and the caller decides what they mean.
 */
async function refreshSerialised(accountId: string, due: (a: Account) => boolean): Promise<{ account: Account; error?: unknown }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`;
      const current = await tx.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (!due(current)) return { account: current }; // another job refreshed while we waited for the lock
      const provider = providerFor(current.provider);
      try {
        // The app the account was connected with: the user's own X app, or Orvane's for the other platforms
        const creds = await resolveCredentials(current.userId, provider.slug);
        const fresh = await refreshTokenSet(
          provider.slug,
          { accessToken: decrypt(current.accessToken), refreshToken: current.refreshToken ? decrypt(current.refreshToken) : null },
          creds,
        );
        return { account: await saveTokens(current.id, fresh, tx) };
      } catch (error) {
        return { account: current, error };
      }
    },
    // maxWait: how long to wait for a connection; timeout: the whole transaction, i.e. the lock wait plus one provider call
    { maxWait: 10_000, timeout: 45_000 },
  );
}

/**
 * Returns a usable access token for a connected account, refreshing it first when needed.
 * Refreshes of one account are serialised (see `refreshSerialised`), so a job that loses the race simply gets the winner's token.
 */
export async function getAccessToken(accountId: string): Promise<{ accessToken: string; platformUserId: string }> {
  let account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  const provider = providerFor(account.provider);
  const due = (a: Account) => needsRefresh(provider.slug, { ...a, hasRefreshToken: !!a.refreshToken });

  if (due(account)) {
    const result = await refreshSerialised(accountId, due);
    account = result.account;
    if (result.error !== undefined) {
      if (isExpired(account)) {
        // Only a provider rejection (4xx) means the user must reconnect; network errors and 5xx stay retryable
        const e = result.error;
        const rejected = e instanceof OAuthError && e.status >= 400 && e.status < 500 && e.status !== 429;
        if (rejected) throw new ReconnectRequiredError(provider.label);
        throw e;
      }
      console.warn(`token refresh failed for ${provider.label}, using the current token`, result.error);
    }
  } else if (isExpired(account)) {
    throw new ReconnectRequiredError(provider.label);
  }

  return { accessToken: decrypt(account.accessToken), platformUserId: account.platformUserId };
}
