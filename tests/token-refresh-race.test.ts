import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

/**
 * X refresh tokens are single-use: the second request with an already used one is rejected. Real database, fake provider
 * that behaves like X (rotates, rejects reuse, answers slowly), several jobs asking for a token at the same moment.
 */

const provider = vi.hoisted(() => ({ used: new Set<string>(), calls: 0 }));

vi.mock("@/lib/social/app-credentials", () => ({ resolveCredentials: vi.fn(async () => ({ clientId: "c", clientSecret: "s" })) }));
vi.mock("@/lib/social/providers", async (orig) => {
  const real = await orig<typeof import("@/lib/social/providers")>();
  return {
    ...real,
    refreshTokenSet: vi.fn(async (_slug: string, current: { refreshToken: string | null }) => {
      provider.calls++;
      const used = current.refreshToken;
      if (!used || provider.used.has(used)) throw new real.OAuthError("invalid_grant", 400);
      provider.used.add(used); // single use: marked the moment X receives it
      await new Promise((r) => setTimeout(r, 150)); // the answer takes a while to come back
      return { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: new Date(Date.now() + 7200_000) };
    }),
  };
});

import { getAccessToken } from "@/lib/social/tokens";

const stamp = Date.now();
let userId: string;
let accountId: string;

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `race-${stamp}@test.local` } })).id;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});
beforeEach(async () => {
  provider.used.clear();
  provider.calls = 0;
  await prisma.socialAccount.deleteMany({ where: { userId } });
  accountId = (
    await prisma.socialAccount.create({
      data: {
        userId,
        provider: "TWITTER",
        platformUserId: `x-race-${stamp}`,
        accessToken: encrypt("old-access"),
        refreshToken: encrypt("old-refresh"),
        expiresAt: new Date(Date.now() - 60_000), // already expired
      },
    })
  ).id;
});

describe("concurrent token refresh", () => {
  it("refreshes once and hands every caller the new token, never a reconnect error", async () => {
    const results = await Promise.all([getAccessToken(accountId), getAccessToken(accountId), getAccessToken(accountId)]);
    expect(results.map((r) => r.accessToken)).toEqual(["new-access", "new-access", "new-access"]);
    expect(provider.calls).toBe(1);
    const row = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(decrypt(row.refreshToken!)).toBe("new-refresh");
  });

  it("still asks for a reconnect when the provider really rejects the refresh token", async () => {
    provider.used.add("old-refresh"); // revoked by the user on the provider's side
    await expect(getAccessToken(accountId)).rejects.toMatchObject({ name: "ReconnectRequiredError" });
  });
});
