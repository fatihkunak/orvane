import { beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/crypto";

/** getAccessToken and the refresh cron with the database and the provider faked: only the decision logic runs. */

const account = {
  id: "acc1",
  userId: "u1",
  provider: "TWITTER",
  platformUserId: "x-1",
  accessToken: encrypt("old-access"),
  refreshToken: encrypt("old-refresh"),
  expiresAt: new Date(Date.now() - 60_000), // already expired
  updatedAt: new Date(Date.now() - 3600_000),
  scopes: [] as string[],
};

const db = vi.hoisted(() => ({ findUniqueOrThrow: vi.fn(), findMany: vi.fn(), update: vi.fn() }));
const refresh = vi.hoisted(() => ({ refreshTokenSet: vi.fn() }));

// The refresh runs inside a transaction (advisory lock); here the "transaction" just hands the same fakes to the callback
vi.mock("@/lib/prisma", () => ({
  prisma: { socialAccount: db, $transaction: async (fn: (tx: unknown) => unknown) => fn({ socialAccount: db, $executeRaw: vi.fn() }) },
}));
vi.mock("@/lib/social/app-credentials", () => ({ resolveCredentials: vi.fn(async () => ({ clientId: "c", clientSecret: "s" })) }));
vi.mock("@/lib/social/providers", async (orig) => ({ ...(await orig<typeof import("@/lib/social/providers")>()), refreshTokenSet: refresh.refreshTokenSet }));

import { refreshTokensHandler } from "@/inngest/functions";
import { OAuthError } from "@/lib/social/providers";
import { ReconnectRequiredError, getAccessToken } from "@/lib/social/tokens";

beforeEach(() => {
  vi.clearAllMocks();
  db.findUniqueOrThrow.mockResolvedValue(account);
});

describe("getAccessToken when the token already expired and refresh fails", () => {
  it("asks for a reconnect when the provider rejects the refresh token", async () => {
    refresh.refreshTokenSet.mockRejectedValue(new OAuthError("invalid_grant", 400));
    await expect(getAccessToken("acc1")).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("keeps the failure retryable on a network error or 5xx, instead of telling the user to reconnect", async () => {
    for (const err of [new OAuthError("upstream down", 503), new TypeError("fetch failed")]) {
      refresh.refreshTokenSet.mockRejectedValueOnce(err);
      const e = await getAccessToken("acc1").catch((x) => x);
      expect(e).not.toBeInstanceOf(ReconnectRequiredError);
      expect(e).toBe(err);
    }
  });
});

describe("refresh-expiring-tokens cron", () => {
  it("never returns a token from a step: step output is persisted in Inngest's run state", async () => {
    db.findMany.mockResolvedValue([{ id: "acc1" }]);
    db.findUniqueOrThrow.mockResolvedValue({ ...account, expiresAt: new Date(Date.now() + 2 * 60_000) });
    refresh.refreshTokenSet.mockResolvedValue({ accessToken: "new-access-secret", refreshToken: "new-refresh-secret", expiresAt: new Date(Date.now() + 7200_000) });
    db.update.mockResolvedValue({ ...account, accessToken: encrypt("new-access-secret"), updatedAt: new Date() });

    const outputs: unknown[] = [];
    const step = {
      run: async (_id: string, fn: () => unknown) => {
        const out = await fn();
        outputs.push(out);
        return out;
      },
    };
    await refreshTokensHandler({ step: step as never });

    expect(refresh.refreshTokenSet).toHaveBeenCalled();
    const serialized = JSON.stringify(outputs);
    expect(serialized).not.toContain("new-access-secret");
    expect(serialized).not.toContain("old-access");
  });
});
