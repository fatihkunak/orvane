import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createApiToken, hashToken, listApiTokens, MAX_ACTIVE_TOKENS, revokeApiToken, verifyApiToken } from "@/lib/api-tokens";
import { createMcpServer } from "@/lib/mcp/server";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { findDuePostIds, loadPublishJob } from "@/lib/publishing";
import { adminStats, getUserDetail, listUsers, setSuspended } from "@/lib/admin-users";
import { POST as mcpPost, GET as mcpGet } from "@/app/api/mcp/route";
import { GET as adminUsers } from "@/app/api/admin/users/route";
import { GET as adminUser } from "@/app/api/admin/users/[id]/route";
import { POST as adminSuspend } from "@/app/api/admin/users/[id]/suspend/route";
import { GET as adminStatsRoute } from "@/app/api/admin/stats/route";

/** Integration tests against the local Postgres: every row hangs off throw-away users, cleanup is a cascading delete. */

let userId: string;
let otherId: string;
const stamp = Date.now();
const ADMIN_TOKEN = "t".repeat(40);

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `mcp-${stamp}@test.local`, name: "Mcp Test" } })).id;
  otherId = (await prisma.user.create({ data: { email: `mcp-other-${stamp}@test.local` } })).id;
  for (const [uid, provider, pid] of [[userId, "TWITTER", "x-m"], [userId, "LINKEDIN", "li-m"], [otherId, "TWITTER", "x-o"]] as const) {
    await prisma.socialAccount.create({ data: { userId: uid, provider, platformUserId: pid, username: `h-${pid}`, accessToken: encrypt("SECRET-ACCESS"), refreshToken: encrypt("SECRET-REFRESH") } });
  }
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.$disconnect();
});
beforeEach(() => {
  vi.stubEnv("ORVANE_ADMIN_TOKEN", ADMIN_TOKEN);
  vi.stubEnv("APP_URL", "http://localhost:3055");
  resetRateLimits();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.post.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.apiToken.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.updateMany({ where: { id: { in: [userId, otherId] } }, data: { suspendedAt: null } });
});

describe("api tokens", () => {
  it("shows the token once and stores only its hash", async () => {
    const { token } = await createApiToken(userId, "LM Studio");
    expect(token).toMatch(/^orv_[\w-]{43}$/);
    const row = await prisma.apiToken.findFirstOrThrow({ where: { userId } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await verifyApiToken(token)).toEqual({ userId, tokenId: row.id });
    expect((await listApiTokens(userId))[0]).toMatchObject({ name: "LM Studio", prefix: token.slice(0, 8) });
  });

  it("rejects unknown, malformed, revoked and suspended-user tokens", async () => {
    expect(await verifyApiToken("orv_nope")).toBeNull();
    expect(await verifyApiToken("not-a-token")).toBeNull();
    const { token } = await createApiToken(userId, "a");
    const id = (await prisma.apiToken.findFirstOrThrow({ where: { userId } })).id;
    await setSuspended(userId, true);
    expect(await verifyApiToken(token)).toBeNull();
    await setSuspended(userId, false);
    expect(await verifyApiToken(token)).not.toBeNull();
    expect(await revokeApiToken(otherId, id)).toBe(false); // someone else's token
    expect(await revokeApiToken(userId, id)).toBe(true);
    expect(await verifyApiToken(token)).toBeNull();
  });

  it("limits active tokens and needs a name", async () => {
    await expect(createApiToken(userId, "  ")).rejects.toThrow();
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await createApiToken(userId, `t${i}`);
    await expect(createApiToken(userId, "one too many")).rejects.toThrow(/En fazla/);
  });
});

async function connect(uid: string) {
  const client = new Client({ name: "test", version: "1" });
  const server = createMcpServer(uid);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const first = (r.content as Array<{ text: string }>)[0]!.text;
    return { isError: !!r.isError, text: first, json: () => JSON.parse(first) as never };
  };
  return { client, call };
}

describe("MCP tools", () => {
  it("offers draft tools only: nothing that schedules or publishes", async () => {
    const { client } = await connect(userId);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["create_draft", "delete_draft", "get_platform_limits", "get_post", "list_connected_accounts", "list_posts", "update_draft"]);
  });

  it("lists connected accounts and limits without any secret", async () => {
    const { call } = await connect(userId);
    const accounts = await call("list_connected_accounts");
    expect(accounts.text).toContain("h-x-m");
    expect(accounts.text).not.toMatch(/SECRET|accessToken|refreshToken/);
    expect((await call("get_platform_limits")).text).toContain("280");
  });

  it("creates a draft with a text per platform and reads it back", async () => {
    const { call } = await connect(userId);
    const made = await call("create_draft", { text: "uzun ortak metin", platforms: ["TWITTER", "LINKEDIN"], overrides: { TWITTER: "kısa X" } });
    expect(made.isError).toBe(false);
    const { id } = made.json() as { id: string };
    const post = (await call("get_post", { id })).json() as { status: string; platforms: Array<{ platform: string; ownText: string | null }> };
    expect(post.status).toBe("DRAFT");
    expect(post.platforms.find((p) => p.platform === "TWITTER")!.ownText).toBe("kısa X");
    expect(post.platforms.find((p) => p.platform === "LINKEDIN")!.ownText).toBeNull();
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).scheduledAt).toBeNull(); // never scheduled
  });

  it("applies the same limits and account rules as the app", async () => {
    const { call } = await connect(userId);
    const tooLong = await call("create_draft", { text: "x".repeat(300), platforms: ["TWITTER"] });
    expect(tooLong).toMatchObject({ isError: true });
    expect(tooLong.text).toContain("Karakter sınırı");
    const noAccount = await call("create_draft", { text: "merhaba", platforms: ["THREADS"] });
    expect(noAccount).toMatchObject({ isError: true });
    expect(noAccount.text).toContain("hesabını bağla");
  });

  it("edits and deletes drafts, never other users' posts or non-drafts", async () => {
    const { call } = await connect(userId);
    const { id } = (await call("create_draft", { text: "ilk", platforms: ["TWITTER", "LINKEDIN"] })).json() as { id: string };

    expect((await call("update_draft", { id, text: "ikinci", overrides: { LINKEDIN: "li özel" } })).isError).toBe(false);
    const after = await prisma.post.findUniqueOrThrow({ where: { id }, include: { platforms: true } });
    expect(after.text).toBe("ikinci");
    expect(after.platforms.find((p) => p.platform === "LINKEDIN")!.text).toBe("li özel");
    await call("update_draft", { id, overrides: { LINKEDIN: "" } }); // empty removes the own text
    expect((await prisma.postPlatform.findFirstOrThrow({ where: { postId: id, platform: "LINKEDIN" } })).text).toBeNull();
    expect((await call("update_draft", { id, text: "y".repeat(300), overrides: { TWITTER: "" } })).isError).toBe(true); // too long for X

    await prisma.post.update({ where: { id }, data: { status: "PUBLISHED" } });
    expect((await call("update_draft", { id, text: "değişmesin" })).isError).toBe(true);
    expect((await call("delete_draft", { id })).isError).toBe(true);

    const mine = await connect(otherId);
    const theirs = (await call("create_draft", { text: "benim", platforms: ["TWITTER"] })).json() as { id: string };
    expect((await mine.call("get_post", { id: theirs.id })).isError).toBe(true);
    expect((await mine.call("delete_draft", { id: theirs.id })).isError).toBe(true);
    expect((await mine.call("list_posts")).text).not.toContain(theirs.id);
  });
});

const rpc = (method: string, params: unknown = {}, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3055/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
const initialize = { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } };

describe("MCP endpoint", () => {
  it("needs a valid bearer token", async () => {
    expect((await mcpPost(rpc("initialize", initialize))).status).toBe(401);
    expect((await mcpPost(rpc("initialize", initialize, { authorization: "Bearer orv_wrong" }))).status).toBe(401);
  });

  it("answers an initialize and a tool call for a valid token, scoped to its user", async () => {
    const { token } = await createApiToken(userId, "e2e");
    const auth = { authorization: `Bearer ${token}` };
    const init = await mcpPost(rpc("initialize", initialize, auth));
    expect(init.status).toBe(200);
    expect(((await init.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("orvane");

    const res = await mcpPost(rpc("tools/call", { name: "list_connected_accounts", arguments: {} }, auth));
    const body = (await res.json()) as { result: { content: Array<{ text: string }> } };
    expect(body.result.content[0]!.text).toContain("h-x-m");
    expect(body.result.content[0]!.text).not.toContain("h-x-o"); // the other user's account
  });

  it("refuses a browser Origin that is not the app, and non-POST methods", async () => {
    const { token } = await createApiToken(userId, "o");
    const auth = { authorization: `Bearer ${token}` };
    expect((await mcpPost(rpc("initialize", initialize, { ...auth, origin: "https://evil.example" }))).status).toBe(403);
    expect((await mcpPost(rpc("initialize", initialize, { ...auth, origin: "http://localhost:3055" }))).status).toBe(200);
    expect((await mcpGet()).status).toBe(405);
  });

  it("stops working the moment the user is suspended", async () => {
    const { token } = await createApiToken(userId, "s");
    await setSuspended(userId, true);
    expect((await mcpPost(rpc("initialize", initialize, { authorization: `Bearer ${token}` }))).status).toBe(401);
  });
});

const adminReq = (path: string, init: RequestInit & { token?: string | null } = {}) => {
  const { token = ADMIN_TOKEN, ...rest } = init;
  return new Request(`http://localhost:3055${path}`, { ...rest, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(rest.headers ?? {}) } });
};

describe("admin API", () => {
  it("is off without a long enough token, and rejects a wrong one", async () => {
    vi.stubEnv("ORVANE_ADMIN_TOKEN", "short");
    expect((await adminUsers(adminReq("/api/admin/users", { token: "short" }))).status).toBe(503);
    vi.stubEnv("ORVANE_ADMIN_TOKEN", ADMIN_TOKEN);
    expect((await adminUsers(adminReq("/api/admin/users", { token: null }))).status).toBe(401);
    expect((await adminUsers(adminReq("/api/admin/users", { token: "x".repeat(40) }))).status).toBe(401);
    expect((await adminUsers(adminReq("/api/admin/users"))).status).toBe(200);
  });

  it("slows down repeated wrong guesses", async () => {
    const wrong = () => adminUsers(adminReq("/api/admin/users", { token: "x".repeat(40), headers: { "cf-connecting-ip": "203.0.113.9" } }));
    for (let i = 0; i < 10; i++) expect((await wrong()).status).toBe(401);
    expect((await wrong()).status).toBe(429);
  });

  it("lists users with counts and searches by email", async () => {
    await prisma.post.create({ data: { userId, text: "a", status: "PUBLISHED" } });
    await prisma.post.create({ data: { userId, text: "b", status: "DRAFT" } });
    const res = await adminUsers(adminReq(`/api/admin/users?q=mcp-${stamp}`));
    const body = (await res.json()) as Awaited<ReturnType<typeof listUsers>>;
    expect(body.total).toBe(1); // "mcp-<stamp>" is not a substring of the other user's "mcp-other-<stamp>"
    const mine = body.users.find((u) => u.id === userId)!;
    expect(mine).toMatchObject({ email: `mcp-${stamp}@test.local`, accounts: expect.arrayContaining(["TWITTER", "LINKEDIN"]), posts: { total: 2, published: 1, draft: 1, scheduled: 0, failed: 0 } });
  });

  it("shows a user's detail without any secret", async () => {
    await prisma.aiProviderConfig.create({ data: { userId, provider: "groq", apiKey: encrypt("sk-VERY-SECRET-KEY"), position: 0 } });
    await createApiToken(userId, "visible name");
    const res = await adminUser(adminReq(`/api/admin/users/${userId}`), { params: Promise.resolve({ id: userId }) });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("visible name");
    expect(text).toContain("groq");
    expect(text).not.toMatch(/SECRET|apiKey|accessToken|refreshToken|tokenHash|orv_[\w-]{43}/);
    expect((await adminUser(adminReq("/api/admin/users/nope"), { params: Promise.resolve({ id: "nope" }) })).status).toBe(404);
  });

  it("suspends: scheduled posts go back to draft, nothing is published, and restoring works", async () => {
    const post = await prisma.post.create({
      data: { userId, text: "due", status: "SCHEDULED", scheduledAt: new Date(Date.now() - 60_000), platforms: { create: [{ platform: "TWITTER", socialAccountId: (await prisma.socialAccount.findFirstOrThrow({ where: { userId, provider: "TWITTER" } })).id }] } },
    });
    expect(await findDuePostIds()).toContain(post.id);

    const res = await adminSuspend(adminReq(`/api/admin/users/${userId}/suspend`, { method: "POST", body: JSON.stringify({ suspended: true }) }), { params: Promise.resolve({ id: userId }) });
    expect(await res.json()).toMatchObject({ postsReturnedToDraft: 1 });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("DRAFT");
    expect(await findDuePostIds()).not.toContain(post.id);
    expect((await getUserDetail(userId))!.suspendedAt).not.toBeNull();

    // A post that somehow is SCHEDULED for a suspended user is still not published
    await prisma.post.update({ where: { id: post.id }, data: { status: "SCHEDULED" } });
    expect(await findDuePostIds()).not.toContain(post.id);
    expect(await loadPublishJob(post.id)).toBeNull();

    await adminSuspend(adminReq(`/api/admin/users/${userId}/suspend`, { method: "POST", body: JSON.stringify({ suspended: false }) }), { params: Promise.resolve({ id: userId }) });
    expect((await getUserDetail(userId))!.suspendedAt).toBeNull();
    expect(await findDuePostIds()).toContain(post.id);
  });

  it("validates the suspend body and the user", async () => {
    const p = { params: Promise.resolve({ id: userId }) };
    expect((await adminSuspend(adminReq("/x", { method: "POST", body: JSON.stringify({ suspended: "yes" }) }), p)).status).toBe(400);
    expect((await adminSuspend(adminReq("/x", { method: "POST", body: "not json" }), p)).status).toBe(400);
    expect((await adminSuspend(adminReq("/x", { method: "POST", body: JSON.stringify({ suspended: true }) }), { params: Promise.resolve({ id: "nope" }) })).status).toBe(404);
  });

  it("reports totals", async () => {
    await setSuspended(otherId, true);
    const s = await adminStats();
    expect(s.users.total).toBeGreaterThanOrEqual(2);
    expect(s.users.suspended).toBeGreaterThanOrEqual(1);
    expect((await (await adminStatsRoute(adminReq("/api/admin/stats"))).json()) as object).toHaveProperty("accounts");
  });
});
