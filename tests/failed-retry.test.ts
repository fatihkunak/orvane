import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { retryFailedPostForUser, updateDraftForUser } from "@/lib/post-create";
import { getPostForForm } from "@/lib/queries/posts";
import { findDuePostIds } from "@/lib/publishing";

/**
 * A failed post can be retried or edited and sent again. The one rule that must never break: a platform that already
 * published is never published a second time. Real database; every row hangs off throw-away users.
 */

const stamp = Date.now();
let userId: string;
let otherId: string;

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `retry-${stamp}@test.local` } })).id;
  otherId = (await prisma.user.create({ data: { email: `retry-other-${stamp}@test.local` } })).id;
  for (const [uid, provider, pid] of [[userId, "TWITTER", "x-r"], [userId, "LINKEDIN", "li-r"], [userId, "THREADS", "th-r"], [otherId, "TWITTER", "x-ro"]] as const) {
    await prisma.socialAccount.create({ data: { userId: uid, provider, platformUserId: pid, accessToken: encrypt(`${provider}-token`), expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) } });
  }
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.post.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

const account = async (uid: string, provider: "TWITTER" | "LINKEDIN" | "THREADS") =>
  (await prisma.socialAccount.findFirstOrThrow({ where: { userId: uid, provider } })).id;

/** X published, LinkedIn failed: the interesting case. */
async function partiallyPublished(uid = userId) {
  const post = await prisma.post.create({
    data: {
      userId: uid,
      text: "ilk metin",
      status: "FAILED",
      scheduledAt: new Date(Date.now() - 3600_000),
      platforms: {
        create: [
          { platform: "TWITTER", socialAccountId: await account(uid, "TWITTER"), status: "PUBLISHED", publishedPostId: "tweet-1", publishedAt: new Date() },
          ...(uid === userId ? [{ platform: "LINKEDIN" as const, socialAccountId: await account(uid, "LINKEDIN"), status: "FAILED" as const, error: "401 token" }] : []),
        ],
      },
    },
  });
  return post.id;
}
const rows = async (postId: string) =>
  Object.fromEntries((await prisma.postPlatform.findMany({ where: { postId } })).map((r) => [r.platform, r]));

describe("retrying a failed post", () => {
  it("re-queues only the failed platforms and never touches one that already published", async () => {
    const id = await partiallyPublished();
    const r = await retryFailedPostForUser(userId, id, null);
    expect(r.ok).toBe(true);

    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("SCHEDULED");
    expect(post.scheduledAt!.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
    const p = await rows(id);
    expect(p.LINKEDIN).toMatchObject({ status: "PENDING", error: null });
    expect(p.TWITTER).toMatchObject({ status: "PUBLISHED", publishedPostId: "tweet-1" });
    expect(await findDuePostIds()).toContain(id);
  });

  it("can wait for a chosen time instead of going out now", async () => {
    const id = await partiallyPublished();
    const when = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await retryFailedPostForUser(userId, id, when)).ok).toBe(true);
    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post).toMatchObject({ status: "SCHEDULED" });
    expect(post.scheduledAt!.toISOString()).toBe(when);
    expect(await findDuePostIds()).not.toContain(id);
  });

  it("refuses a time in the past, another user's post, and anything that is not FAILED", async () => {
    const id = await partiallyPublished();
    expect((await retryFailedPostForUser(userId, id, new Date(Date.now() - 3600_000).toISOString())).ok).toBe(false);
    expect((await retryFailedPostForUser(otherId, id, null)).ok).toBe(false);
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe("FAILED");

    for (const status of ["DRAFT", "SCHEDULED", "PUBLISHED"] as const) {
      await prisma.post.update({ where: { id }, data: { status } });
      expect((await retryFailedPostForUser(userId, id, null)).ok, status).toBe(false);
    }
  });

  it("a second click does not queue it twice", async () => {
    const id = await partiallyPublished();
    expect((await retryFailedPostForUser(userId, id, null)).ok).toBe(true);
    expect((await retryFailedPostForUser(userId, id, null)).ok).toBe(false);
  });
});

describe("editing a failed post", () => {
  const input = (over: Partial<Parameters<typeof updateDraftForUser>[2]> = {}) => ({
    text: "düzeltilmiş metin",
    platforms: ["TWITTER", "LINKEDIN"] as ("TWITTER" | "LINKEDIN" | "THREADS")[],
    overrides: {},
    mediaUrls: [],
    mode: "now" as const,
    ...over,
  });

  it("opens in the form and says which platforms are already published", async () => {
    const id = await partiallyPublished();
    const f = await getPostForForm(userId, id);
    expect(f).toMatchObject({ id, status: "FAILED", publishedPlatforms: ["TWITTER"] });
    expect(f!.platforms.sort()).toEqual(["LINKEDIN", "TWITTER"]);
  });

  it("sends the failed platform again with the new text and leaves the published one alone", async () => {
    const id = await partiallyPublished();
    const r = await updateDraftForUser(userId, id, input({ overrides: { LINKEDIN: "yeni linkedin metni", TWITTER: "x metni değişti" } }));
    expect(r.ok).toBe(true);
    const post = await prisma.post.findUniqueOrThrow({ where: { id } });
    expect(post.status).toBe("SCHEDULED");
    const p = await rows(id);
    expect(p.LINKEDIN).toMatchObject({ status: "PENDING", error: null, text: "yeni linkedin metni" });
    expect(p.TWITTER).toMatchObject({ status: "PUBLISHED", publishedPostId: "tweet-1", text: null }); // untouched, text change ignored
  });

  it("can add a platform that never ran", async () => {
    const id = await partiallyPublished();
    const r = await updateDraftForUser(userId, id, input({ platforms: ["TWITTER", "LINKEDIN", "THREADS"] }));
    expect(r.ok).toBe(true);
    expect((await rows(id)).THREADS).toMatchObject({ status: "PENDING" });
  });

  it("rejects, and changes nothing, when a published platform is dropped, the post would become a draft, or nothing is left to send", async () => {
    const id = await partiallyPublished();
    const before = JSON.stringify(await rows(id));
    expect((await updateDraftForUser(userId, id, input({ platforms: ["LINKEDIN"] }))).ok).toBe(false); // drops the published X
    expect((await updateDraftForUser(userId, id, input({ mode: "draft" }))).ok).toBe(false);
    expect((await updateDraftForUser(userId, id, input({ platforms: ["TWITTER"] }))).ok).toBe(false); // nothing to retry
    expect(JSON.stringify(await rows(id))).toBe(before);
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe("FAILED");
  });
});
