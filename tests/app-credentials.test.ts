import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  AppCredentialError,
  credentialStatus,
  removeOwnCredentials,
  resolveCredentials,
  saveOwnCredentials,
} from "@/lib/social/app-credentials";
import { finishConnect, startConnect } from "@/lib/social/oauth-flow";

// The connect flow only needs `auth()` to say who is signed in
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

let userId: string;
let otherId: string;
const stamp = Date.now();
const BASE = "https://app.example.com";

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `appkeys-${stamp}@test.local` } })).id;
  otherId = (await prisma.user.create({ data: { email: `appkeys-other-${stamp}@test.local` } })).id;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.$disconnect();
});
beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: userId } });
  vi.stubEnv("APP_URL", BASE);
  vi.stubEnv("SHARED_X_APP", ""); // do not depend on the developer's real .env
  vi.stubEnv("TWITTER_CLIENT_ID", "shared-id");
  vi.stubEnv("TWITTER_CLIENT_SECRET", "shared-secret");
  vi.stubEnv("LINKEDIN_CLIENT_ID", "li-id");
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "li-secret");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.socialAccount.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.socialAppCredential.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

describe("whose X app is used", () => {
  it("stores the secret encrypted and never reports it back", async () => {
    await saveOwnCredentials(userId, "twitter", "  my-client-id  ", "my-client-secret");
    const row = await prisma.socialAppCredential.findFirstOrThrow({ where: { userId } });
    expect(row.clientId).toBe("my-client-id");
    expect(row.clientSecret).not.toContain("my-client-secret");
    expect(decrypt(row.clientSecret)).toBe("my-client-secret");

    const status = await credentialStatus(userId, "twitter");
    expect(status).toEqual({ hasOwn: true, clientIdHint: "my-c…", sharedAvailable: false });
    expect(JSON.stringify(status)).not.toContain("my-client-secret");
  });

  it("uses the user's own app, and ignores the environment keys unless the shared mode is on", async () => {
    expect(await resolveCredentials(userId, "twitter")).toBeNull(); // env keys exist, but the shared mode is off
    await saveOwnCredentials(userId, "twitter", "own-id", "own-secret");
    expect(await resolveCredentials(userId, "twitter")).toEqual({ clientId: "own-id", clientSecret: "own-secret", source: "own" });
    expect(await resolveCredentials(otherId, "twitter")).toBeNull(); // another user's keys never apply

    vi.stubEnv("SHARED_X_APP", "1");
    expect((await resolveCredentials(userId, "twitter"))!.source).toBe("own"); // own still wins
    expect(await resolveCredentials(otherId, "twitter")).toEqual({ clientId: "shared-id", clientSecret: "shared-secret", source: "shared" });
  });

  it("keeps LinkedIn and Threads on Orvane's own app for everyone", async () => {
    expect(await resolveCredentials(userId, "linkedin")).toEqual({ clientId: "li-id", clientSecret: "li-secret", source: "shared" });
  });

  it("treats keys that cannot be decrypted as not configured", async () => {
    await prisma.socialAppCredential.create({ data: { userId, provider: "TWITTER", clientId: "id", clientSecret: "v1.broken.broken.broken" } });
    expect(await resolveCredentials(userId, "twitter")).toBeNull();
  });

  it("validates what is saved", async () => {
    await expect(saveOwnCredentials(userId, "twitter", "", "x")).rejects.toThrow(AppCredentialError);
    await expect(saveOwnCredentials(userId, "twitter", "id", "   ")).rejects.toThrow(AppCredentialError);
    await expect(saveOwnCredentials(userId, "twitter", "has space", "x")).rejects.toThrow(/boşluk/);
    await expect(saveOwnCredentials(userId, "twitter", "id", "x".repeat(300))).rejects.toThrow(/uzun/);
    await expect(saveOwnCredentials(userId, "linkedin", "id", "x")).rejects.toThrow(AppCredentialError); // not a bring-your-own platform
    expect(await prisma.socialAppCredential.count({ where: { userId } })).toBe(0);
  });

  it("refuses to remove keys while an X account connected with them exists", async () => {
    await saveOwnCredentials(userId, "twitter", "id", "secret");
    await prisma.socialAccount.create({ data: { userId, provider: "TWITTER", platformUserId: "x1", accessToken: encrypt("a") } });
    await expect(removeOwnCredentials(userId, "twitter")).rejects.toThrow(/bağlı hesabı kes/);
    await prisma.socialAccount.deleteMany({ where: { userId } });
    expect(await removeOwnCredentials(userId, "twitter")).toBe(true);
    expect(await resolveCredentials(userId, "twitter")).toBeNull();
  });
});

describe("connecting X with the user's own app", () => {
  const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  it("asks for the keys first, then sends the user to X with THEIR client id", async () => {
    const none = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    expect(new URL(none.headers.get("location")!).search).toContain("error=not_configured");

    await saveOwnCredentials(userId, "twitter", "own-client-id", "own-client-secret");
    const res = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(loc.searchParams.get("client_id")).toBe("own-client-id");
  });

  it("exchanges the code with the user's own secret, so X bills their app", async () => {
    await saveOwnCredentials(userId, "twitter", "own-client-id", "own-client-secret");
    const start = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;

    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        seen.push({ url, auth: new Headers(init?.headers).get("authorization") });
        if (url.includes("oauth2/token")) return Response.json({ access_token: "acc", refresh_token: "ref", expires_in: 7200, scope: "tweet.read" });
        return Response.json({ data: { id: "42", username: "someone", name: "Some One" } });
      }),
    );
    const res = await finishConnect(new Request(`${BASE}/api/connect/twitter/callback?code=abc&state=${state}`, { headers: { cookie: cookieHeader(start) } }), "twitter");
    expect(new URL(res.headers.get("location")!).search).toContain("connected=twitter");

    const token = seen.find((s) => s.url.includes("oauth2/token"))!;
    expect(token.auth).toBe(`Basic ${Buffer.from("own-client-id:own-client-secret").toString("base64")}`);
    expect(await prisma.socialAccount.count({ where: { userId, provider: "TWITTER" } })).toBe(1);
  });
});
