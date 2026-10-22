import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { finishConnect, startConnect } from "@/lib/social/oauth-flow";

// The flow only needs `auth()` to say who is signed in
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

let userId: string;
const BASE = "https://app.example.com";

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `oauth-${Date.now()}@test.local` } })).id;
});
afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: userId } });
  vi.stubEnv("APP_URL", BASE);
  vi.stubEnv("SHARED_X_APP", "1"); // these tests cover the shared (private install) mode; per-user keys are in app-credentials.test.ts
  vi.stubEnv("TWITTER_CLIENT_ID", "xid");
  vi.stubEnv("TWITTER_CLIENT_SECRET", "xsecret");
  vi.stubEnv("THREADS_APP_ID", "tid");
  vi.stubEnv("THREADS_APP_SECRET", "tsecret");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.socialAccount.deleteMany({ where: { userId } });
});

const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const callback = (provider: string, query: string, cookie: string) =>
  new Request(`${BASE}/api/connect/${provider}/callback?${query}`, { headers: { cookie } });

describe("connect flow", () => {
  it("starts X OAuth with state, PKCE and a protected cookie", async () => {
    const res = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/api/connect/twitter/callback`);
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");

    const setCookie = res.headers.getSetCookie()[0];
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Secure/i); // base URL is https
    const saved = JSON.parse(decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("=")));
    expect(saved.state).toBe(loc.searchParams.get("state"));
    expect(saved.userId).toBe(userId);
    expect(saved.verifier).toBeTruthy();
  });

  it("sends signed-out users to /login and unconfigured providers back to /accounts", async () => {
    authMock.mockResolvedValueOnce(null);
    const anon = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    expect(new URL(anon.headers.get("location")!).pathname).toBe("/login");

    // Don't depend on the developer's real .env having no LinkedIn keys
    vi.stubEnv("LINKEDIN_CLIENT_ID", "");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "");
    const none = await startConnect(new Request(`${BASE}/api/connect/linkedin`), "linkedin");
    expect(new URL(none.headers.get("location")!).search).toContain("error=not_configured");
  });

  it("404s for unknown providers", async () => {
    expect((await startConnect(new Request(`${BASE}/x`), "myspace")).status).toBe(404);
    expect((await finishConnect(new Request(`${BASE}/x`), "myspace")).status).toBe(404);
  });

  it("completes X: exchanges the code, stores ENCRYPTED tokens, upserts on reconnect", async () => {
    const start = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = cookieHeader(start);

    const fetchMock = vi.fn(async (input: string) =>
      String(input).includes("oauth2/token")
        ? Response.json({ access_token: "AT-1", refresh_token: "RT-1", expires_in: 7200, scope: "tweet.write offline.access" })
        : Response.json({ data: { id: "x-42", username: "fatih", name: "Fatih", profile_image_url: "http://img" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await finishConnect(callback("twitter", `code=abc&state=${state}`, cookie), "twitter");
    expect(new URL(res.headers.get("location")!).search).toBe("?connected=twitter");
    expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=0/i); // one-time state cookie is cleared

    // The verifier from the cookie reached the token endpoint
    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("code_verifier")).toBeTruthy();

    const [acct] = await prisma.socialAccount.findMany({ where: { userId } });
    expect(acct).toMatchObject({ provider: "TWITTER", platformUserId: "x-42", username: "fatih" });
    expect(acct.accessToken).not.toContain("AT-1");
    expect(decrypt(acct.accessToken)).toBe("AT-1");
    expect(decrypt(acct.refreshToken!)).toBe("RT-1");

    // Reconnecting the same X account updates the row instead of duplicating it
    const again = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const s2 = new URL(again.headers.get("location")!).searchParams.get("state")!;
    fetchMock.mockImplementation(async (input: string) =>
      String(input).includes("oauth2/token")
        ? Response.json({ access_token: "AT-2", refresh_token: "RT-2", expires_in: 7200 })
        : Response.json({ data: { id: "x-42", username: "fatih" } }),
    );
    await finishConnect(callback("twitter", `code=def&state=${s2}`, cookieHeader(again)), "twitter");
    const rows = await prisma.socialAccount.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(decrypt(rows[0].accessToken)).toBe("AT-2");
  });

  it("completes Threads with the long-lived token", async () => {
    const start = await startConnect(new Request(`${BASE}/api/connect/threads`), "threads");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const u = new URL(String(input));
        if (u.pathname === "/oauth/access_token") return Response.json({ access_token: "short", user_id: 777 });
        if (u.pathname === "/access_token") return Response.json({ access_token: "long", expires_in: 5183944 });
        return Response.json({ id: "777", username: "fatihkunak", name: "Fatih" });
      }),
    );
    await finishConnect(callback("threads", `code=abc&state=${state}`, cookieHeader(start)), "threads");
    const [acct] = await prisma.socialAccount.findMany({ where: { userId } });
    expect(acct).toMatchObject({ provider: "THREADS", platformUserId: "777", username: "fatihkunak" });
    expect(decrypt(acct.accessToken)).toBe("long");
    expect(acct.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 24 * 3600_000);
  });

  it("rejects a callback whose state does not match (CSRF)", async () => {
    const start = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await finishConnect(callback("twitter", "code=abc&state=forged", cookieHeader(start)), "twitter");
    expect(new URL(res.headers.get("location")!).search).toContain("error=invalid_state");
    expect(fetchMock).not.toHaveBeenCalled(); // no token exchange happened
    expect(await prisma.socialAccount.count({ where: { userId } })).toBe(0);
  });

  it("rejects a callback replayed without the cookie, or by a different user", async () => {
    const start = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    vi.stubGlobal("fetch", vi.fn());

    const noCookie = await finishConnect(callback("twitter", `code=abc&state=${state}`, ""), "twitter");
    expect(new URL(noCookie.headers.get("location")!).search).toContain("error=invalid_state");

    authMock.mockResolvedValue({ user: { id: "someone-else" } });
    const other = await finishConnect(callback("twitter", `code=abc&state=${state}`, cookieHeader(start)), "twitter");
    expect(new URL(other.headers.get("location")!).search).toContain("error=invalid_state");
  });

  it("handles denial and provider failures without storing anything", async () => {
    const start = await startConnect(new Request(`${BASE}/api/connect/twitter`), "twitter");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const denied = await finishConnect(callback("twitter", `error=access_denied&state=${state}`, cookieHeader(start)), "twitter");
    expect(new URL(denied.headers.get("location")!).search).toContain("error=denied");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await finishConnect(callback("twitter", `code=bad&state=${state}`, cookieHeader(start)), "twitter");
    expect(new URL(failed.headers.get("location")!).search).toContain("error=failed");
    expect(await prisma.socialAccount.count({ where: { userId } })).toBe(0);
  });
});
