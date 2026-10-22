import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NonRetriableError } from "inngest";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { findDuePostIds, claimPlatform, loadPublishJob, STALE_PUBLISHING_MS } from "@/lib/publishing";
import { publishPostHandler } from "@/inngest/functions";
import type { Platform } from "@/generated/prisma/enums";

/**
 * Integration tests against the local Postgres (see .env). Every row hangs off one throw-away user,
 * so cleanup is a single cascading delete. Platform HTTP calls are faked via a stubbed global fetch.
 */

let userId: string;
const accounts = {} as Record<Platform, string>;

// A step object that runs everything inline, like Inngest does when nothing fails
const step = {
  run: async (_id: string, fn: () => unknown) => {
    try {
      return await fn();
    } catch (e) {
      // Real Inngest retries first; once exhausted it rethrows to the function body
      throw e;
    }
  },
  sleep: vi.fn(async () => {}),
  sendEvent: vi.fn(async () => {}),
};
const run = (postId: string) => publishPostHandler({ event: { data: { postId } }, step: step as never });

async function makePost(platforms: Platform[], opts: { scheduledAt?: Date; status?: "SCHEDULED" | "DRAFT"; text?: string; texts?: Partial<Record<Platform, string>> } = {}) {
  return prisma.post.create({
    data: {
      userId,
      text: opts.text ?? "test post",
      status: opts.status ?? "SCHEDULED",
      scheduledAt: opts.scheduledAt ?? new Date(Date.now() - 60_000),
      platforms: { create: platforms.map((p) => ({ platform: p, socialAccountId: accounts[p], text: opts.texts?.[p] ?? null })) },
    },
    include: { platforms: true },
  });
}

const stateOf = (postId: string) =>
  prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { platforms: { orderBy: { platform: "asc" } } } });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `it-${Date.now()}@test.local` } });
  userId = user.id;
  for (const [provider, id] of [["TWITTER", "x-1"], ["LINKEDIN", "li-1"], ["THREADS", "th-1"]] as const) {
    const a = await prisma.socialAccount.create({
      data: {
        userId,
        provider,
        platformUserId: id,
        accessToken: encrypt(`${provider}-token`),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
    accounts[provider] = a.id;
  }
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }); // cascades to accounts, posts, platform rows
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.post.deleteMany({ where: { userId } });
});

describe("publish job", () => {
  it("publishes to X and marks the post PUBLISHED", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: "tweet-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const post = await makePost(["TWITTER"]);

    const result = await run(post.id);
    expect(result).toMatchObject({ postId: post.id, status: "PUBLISHED" });

    const s = await stateOf(post.id);
    expect(s.status).toBe("PUBLISHED");
    expect(s.publishedAt).not.toBeNull();
    expect(s.platforms[0]).toMatchObject({ status: "PUBLISHED", publishedPostId: "tweet-1", error: null });
    // The decrypted token reached the API
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer TWITTER-token");
  });

  it("publishes a platform's own text there and the post's text on the others", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the second parameter types init for the recorded calls
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) =>
      String(input).includes("api.x.com")
        ? Response.json({ data: { id: "tweet-own" } })
        : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:own" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const post = await makePost(["TWITTER", "LINKEDIN"], { text: "uzun ortak metin", texts: { TWITTER: "kısa X metni" } });

    await run(post.id);
    expect((await stateOf(post.id)).status).toBe("PUBLISHED");
    const bodies = fetchMock.mock.calls.map(([url, init]) => [String(url), String(init?.body ?? "")] as const);
    expect(bodies.find(([u]) => u.includes("api.x.com"))![1]).toContain("kısa X metni");
    expect(bodies.find(([u]) => u.includes("api.x.com"))![1]).not.toContain("uzun ortak metin");
    expect(bodies.find(([u]) => u.includes("linkedin"))![1]).toContain("uzun ortak metin");
  });

  it("two overlapping runs publish exactly once (atomic claim)", async () => {
    let tweets = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        tweets++;
        await new Promise((r) => setTimeout(r, 30)); // widen the race window
        return Response.json({ data: { id: "tweet-race" } });
      }),
    );
    const post = await makePost(["TWITTER"]);

    await Promise.all([run(post.id), run(post.id)]);
    expect(tweets).toBe(1);
    expect((await stateOf(post.id)).status).toBe("PUBLISHED");
  });

  it("a failing platform does not block the others; the post ends FAILED with the reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        String(input).includes("api.x.com")
          ? new Response("Unauthorized", { status: 401 })
          : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7" } }),
      ),
    );
    const post = await makePost(["TWITTER", "LINKEDIN"]);

    await run(post.id);
    const s = await stateOf(post.id);
    expect(s.status).toBe("FAILED");
    const byPlatform = Object.fromEntries(s.platforms.map((p) => [p.platform, p]));
    expect(byPlatform.LINKEDIN).toMatchObject({ status: "PUBLISHED", publishedPostId: "urn:li:share:7" });
    expect(byPlatform.TWITTER.status).toBe("FAILED");
    expect(byPlatform.TWITTER.error).toContain("401");
  });

  it("marks permanent errors as non-retriable for the job runner", async () => {
    const failing = { ...step, run: vi.fn(async (id: string, fn: () => unknown) => fn()) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })));
    const post = await makePost(["TWITTER"]);

    await publishPostHandler({ event: { data: { postId: post.id } }, step: failing as never });
    const publishStep = failing.run.mock.results.find((_, i) => failing.run.mock.calls[i][0] === "publish-TWITTER")!;
    await expect(publishStep.value).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("refreshes an expired X token (rotating the refresh token) before posting", async () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "xid");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "xsecret");
    await prisma.socialAccount.update({
      where: { id: accounts.TWITTER },
      data: { expiresAt: new Date(Date.now() - 60_000), refreshToken: encrypt("old-refresh") },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- second parameter only types mock.calls
    const fetchMock = vi.fn(async (input: string, init?: { headers: Record<string, string> }) =>
      String(input).endsWith("/oauth2/token")
        ? Response.json({ access_token: "fresh-token", refresh_token: "new-refresh", expires_in: 7200 })
        : Response.json({ data: { id: "tweet-2" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const post = await makePost(["TWITTER"]);

    await run(post.id);
    expect((await stateOf(post.id)).status).toBe("PUBLISHED");

    const tweetCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/2/tweets"))!;
    expect((tweetCall[1] as { headers: Record<string, string> } | undefined)?.headers.Authorization).toBe("Bearer fresh-token");
    const saved = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accounts.TWITTER } });
    expect(decrypt(saved.accessToken)).toBe("fresh-token");
    expect(decrypt(saved.refreshToken!)).toBe("new-refresh");
    expect(saved.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("fails cleanly (no API call) when the token expired and cannot be refreshed", async () => {
    await prisma.socialAccount.update({ where: { id: accounts.LINKEDIN }, data: { expiresAt: new Date(Date.now() - 1000), refreshToken: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const post = await makePost(["LINKEDIN"]);

    await run(post.id);
    const s = await stateOf(post.id);
    expect(s.status).toBe("FAILED");
    expect(s.platforms[0].error).toContain("yeniden bağla");
    expect(fetchMock).not.toHaveBeenCalled();
    await prisma.socialAccount.update({ where: { id: accounts.LINKEDIN }, data: { expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) } });
  });

  it("publishes to Threads in create → wait → publish steps", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const u = new URL(String(input));
      if (u.pathname === "/v1.0/th-1/threads") return Response.json({ id: "container-1" });
      if (u.pathname === "/v1.0/container-1") return Response.json({ status: "FINISHED" });
      return Response.json({ id: "threads-post-1" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const post = await makePost(["THREADS"]);

    await run(post.id);
    expect((await stateOf(post.id)).platforms[0]).toMatchObject({ status: "PUBLISHED", publishedPostId: "threads-post-1" });
    expect(step.sleep).not.toHaveBeenCalled(); // text-only posts need no processing wait
  });

  it("skips posts that are drafts or already finished", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const draft = await makePost(["TWITTER"], { status: "DRAFT" });
    expect(await run(draft.id)).toEqual({ skipped: true });
    expect(await run("does-not-exist")).toEqual({ skipped: true });
  });
});

describe("scheduler queries", () => {
  it("finds only SCHEDULED posts that are due and still have work", async () => {
    const due = await makePost(["TWITTER"]);
    const future = await makePost(["TWITTER"], { scheduledAt: new Date(Date.now() + 3600_000) });
    const draft = await makePost(["TWITTER"], { status: "DRAFT" });
    const ids = await findDuePostIds();
    expect(ids).toContain(due.id);
    expect(ids).not.toContain(future.id);
    expect(ids).not.toContain(draft.id);
  });

  it("claims a row only once and reclaims it after the stale timeout", async () => {
    const post = await makePost(["TWITTER"]);
    const row = post.platforms[0];

    expect(await claimPlatform(row.id)).toBe(true);
    expect(await claimPlatform(row.id)).toBe(false); // fresh PUBLISHING is owned by someone
    expect(await findDuePostIds()).not.toContain(post.id);

    // Pretend the owning run crashed 11 minutes ago
    const old = new Date(Date.now() - STALE_PUBLISHING_MS - 60_000);
    await prisma.$executeRaw`UPDATE "PostPlatform" SET "updatedAt" = ${old} WHERE id = ${row.id}`;
    expect(await findDuePostIds()).toContain(post.id);
    expect((await loadPublishJob(post.id))?.targets).toHaveLength(1);
    expect(await claimPlatform(row.id)).toBe(true);
  });
});
