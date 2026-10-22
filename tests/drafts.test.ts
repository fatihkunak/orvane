import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createPostForUser, updateDraftForUser } from "@/lib/post-create";
import type { CreatePostInput } from "@/lib/validation/post";
import { getPostForForm, listDrafts } from "@/lib/queries/posts";
import { findDuePostIds, loadPublishJob, mediaFor } from "@/lib/publishing";

/** Integration tests against the local Postgres: every row hangs off throw-away users, cleanup is a cascading delete. */

let userId: string;
let otherId: string;
const stamp = Date.now();
const IMG_X = "/api/media/11111111-1111-4111-8111-111111111111.png";
const IMG_LI = "/api/media/22222222-2222-4222-8222-222222222222.png";
const IMG_ALL = "/api/media/33333333-3333-4333-8333-333333333333.png";

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `drafts-${stamp}@test.local` } })).id;
  otherId = (await prisma.user.create({ data: { email: `drafts-other-${stamp}@test.local` } })).id;
  for (const [uid, provider, pid] of [[userId, "TWITTER", "x-d"], [userId, "LINKEDIN", "li-d"], [userId, "THREADS", "th-d"], [otherId, "TWITTER", "x-o"]] as const) {
    await prisma.socialAccount.create({ data: { userId: uid, provider, platformUserId: pid, accessToken: encrypt(`${provider}-token`), expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) } });
  }
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.$disconnect();
});
beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.post.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

const draft = (extra: Record<string, unknown> = {}) =>
  createPostForUser(userId, { text: "ortak metin", platforms: ["TWITTER", "LINKEDIN"], mediaUrls: [], mode: "draft", ...extra } as never);

describe("drafts list and form data", () => {
  it("lists only the user's own drafts, newest first, with per-platform flags", async () => {
    const a = await draft({ overrides: { TWITTER: "kısa" } });
    const b = await draft({ text: "ikinci" });
    await prisma.post.create({ data: { userId, text: "yayında", status: "PUBLISHED" } });
    await createPostForUser(otherId, { text: "başkasının", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" });
    if (!a.ok || !b.ok) throw new Error("setup");

    const list = await listDrafts(userId);
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
    expect(list[1]!.platforms).toEqual([
      { platform: "LINKEDIN", ownText: false, hasMedia: false },
      { platform: "TWITTER", ownText: true, hasMedia: false },
    ]);
  });

  it("gives the form what it needs, and opens a scheduled post that has not gone out", async () => {
    const a = await draft({ overrides: { TWITTER: "kısa X" }, mediaByPlatform: { LINKEDIN: [IMG_LI] } });
    if (!a.ok) throw new Error("setup");
    const f = await getPostForForm(userId, a.id);
    expect(f).toMatchObject({ id: a.id, status: "DRAFT", text: "ortak metin", overrides: { TWITTER: "kısa X" }, mediaByPlatform: { LINKEDIN: [IMG_LI] } });
    expect(f!.platforms.sort()).toEqual(["LINKEDIN", "TWITTER"]);
    expect(await getPostForForm(otherId, a.id)).toBeNull();

    // Scheduled in the future: the calendar's edit link must work
    await prisma.post.update({ where: { id: a.id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() + 3600_000) } });
    expect(await getPostForForm(userId, a.id)).toMatchObject({ id: a.id, status: "SCHEDULED" });

    // Due right now: the publisher may be claiming it, so the form stays closed
    await prisma.post.update({ where: { id: a.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
    expect(await getPostForForm(userId, a.id)).toBeNull();

    await prisma.post.update({ where: { id: a.id }, data: { status: "PUBLISHED" } });
    expect(await getPostForForm(userId, a.id)).toBeNull();
  });

  it("does not present a stand-in text as shared text when every platform has its own", async () => {
    const a = await createPostForUser(userId, { text: "", platforms: ["TWITTER", "LINKEDIN"], overrides: { TWITTER: "x metni", LINKEDIN: "li metni" }, mediaUrls: [], mode: "draft" });
    if (!a.ok) throw new Error("setup");
    expect((await getPostForForm(userId, a.id))!.text).toBe("");
  });
});

describe("saving over a draft", () => {
  it("schedules a draft in place, keeping its id, with per-platform texts and media", async () => {
    const a = await draft({ overrides: { TWITTER: "kısa" } });
    if (!a.ok) throw new Error("setup");
    const when = new Date(Date.now() + 3600_000).toISOString();
    const r = await updateDraftForUser(userId, a.id, {
      text: "ortak metin 2",
      platforms: ["TWITTER", "LINKEDIN", "THREADS"],
      overrides: { TWITTER: "kısa", LINKEDIN: "uzun li" },
      mediaUrls: [IMG_ALL],
      mediaByPlatform: { TWITTER: [IMG_X], LINKEDIN: [IMG_LI] },
      mode: "schedule",
      scheduledAt: when,
    });
    expect(r).toEqual({ ok: true, id: a.id, mode: "schedule" });

    const post = await prisma.post.findUniqueOrThrow({ where: { id: a.id }, include: { platforms: { orderBy: { platform: "asc" } } } });
    expect(post).toMatchObject({ status: "SCHEDULED", text: "ortak metin 2", mediaUrls: [IMG_ALL] });
    expect(post.scheduledAt!.toISOString()).toBe(when);
    expect(post.platforms.map((p) => [p.platform, p.text, p.mediaUrls]).sort((x, y) => String(x[0]).localeCompare(String(y[0])))).toEqual([
      ["LINKEDIN", "uzun li", [IMG_LI]],
      ["THREADS", null, []],
      ["TWITTER", "kısa", [IMG_X]],
    ]);
    expect(await prisma.post.count({ where: { userId } })).toBe(1); // no duplicate post
  });

  it("edits a scheduled post that has not gone out, and refuses one that is due", async () => {
    const a = await draft();
    if (!a.ok) throw new Error("setup");
    await prisma.post.update({ where: { id: a.id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() + 3600_000) } });

    const r = await updateDraftForUser(userId, a.id, {
      text: "düzenlenmiş",
      platforms: ["TWITTER"],
      mediaUrls: [],
      mode: "schedule",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
    });
    expect(r).toMatchObject({ ok: true, mode: "schedule" });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: a.id } })).text).toBe("düzenlenmiş");

    // Its time has come: the publisher may be sending it right now, so the save must not touch it
    await prisma.post.update({ where: { id: a.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
    expect(await updateDraftForUser(userId, a.id, { text: "geç kaldı", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" })).toMatchObject({ ok: false });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: a.id } })).text).toBe("düzenlenmiş");
  });

  it("drops a platform that is no longer selected and can stay a draft", async () => {
    const a = await draft();
    if (!a.ok) throw new Error("setup");
    const r = await updateDraftForUser(userId, a.id, { text: "yalnız x", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" });
    expect(r).toMatchObject({ ok: true, mode: "draft" });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: a.id }, include: { platforms: true } });
    expect(post.status).toBe("DRAFT");
    expect(post.platforms.map((p) => p.platform)).toEqual(["TWITTER"]);
  });

  it("refuses other users' posts, non-drafts, missing accounts and bad input, changing nothing", async () => {
    const a = await draft();
    if (!a.ok) throw new Error("setup");
    const input: CreatePostInput = { text: "x", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" };
    expect(await updateDraftForUser(otherId, a.id, input)).toMatchObject({ ok: false });
    expect(await updateDraftForUser(userId, "nope", input)).toMatchObject({ ok: false });
    // otherId has no LinkedIn account
    const b = await createPostForUser(otherId, { text: "b", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" });
    if (!b.ok) throw new Error("setup");
    expect(await updateDraftForUser(otherId, b.id, { ...input, platforms: ["LINKEDIN"] })).toMatchObject({ ok: false, error: expect.stringContaining("hesabını bağla") });
    expect(await updateDraftForUser(userId, a.id, { ...input, text: "x".repeat(300) })).toMatchObject({ ok: false });
    expect(await updateDraftForUser(userId, a.id, { ...input, mediaByPlatform: { LINKEDIN: [IMG_LI] } })).toMatchObject({ ok: false }); // not selected
    expect(await updateDraftForUser(userId, a.id, { ...input, mediaUrls: ["https://evil.example/x.png"] })).toMatchObject({ ok: false }); // not allowed

    await prisma.post.update({ where: { id: a.id }, data: { status: "SCHEDULED" } });
    expect(await updateDraftForUser(userId, a.id, input)).toMatchObject({ ok: false });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: a.id } })).text).toBe("ortak metin"); // untouched
  });
});

describe("a platform's own media at publish time", () => {
  it("loads each target with its own media and falls back to the shared media", async () => {
    const a = await draft({ mediaUrls: [IMG_ALL], mediaByPlatform: { TWITTER: [IMG_X] } });
    if (!a.ok) throw new Error("setup");
    await prisma.post.update({ where: { id: a.id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 60_000) } });
    expect(await findDuePostIds()).toContain(a.id);

    const job = (await loadPublishJob(a.id))!;
    expect(job.mediaUrls).toEqual([IMG_ALL]);
    const x = job.targets.find((t) => t.platform === "TWITTER")!;
    const li = job.targets.find((t) => t.platform === "LINKEDIN")!;
    expect(mediaFor(x, job.mediaUrls)).toEqual([IMG_X]); // its own image
    expect(mediaFor(li, job.mediaUrls)).toEqual([IMG_ALL]); // no own media: the shared one
  });
});
