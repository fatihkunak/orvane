import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createPostForUser } from "@/lib/post-create";
import { removeUnreferencedMedia, sweepOrphanMedia, uploadsDir } from "@/lib/media-cleanup";
import { localMediaUrl } from "@/lib/media";

/** Real database + the real `.uploads` folder: files must survive while any post points at them. */

const SHARED = "11111111-2222-4333-8444-555555555555.png";
const SOLO = "66666666-7777-4888-8999-aaaaaaaaaaaa.png";
const ORPHAN = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.png";
const FOREIGN = "not-ours.txt";

let userId: string;
const stamp = Date.now();

const place = async (name: string) => {
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(path.join(uploadsDir(), name), Buffer.from("x"));
};

describe("local media cleanup", () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `media-${stamp}@test.local` } })).id;
    await prisma.socialAccount.create({
      data: { userId, provider: "TWITTER", platformUserId: `x-${stamp}`, accessToken: encrypt("SECRET") },
    });
    await place(SHARED);
    await place(SOLO);
    await place(ORPHAN);
    await place(FOREIGN);

    // Two posts pointing at the same file, one with a file of its own
    await createPostForUser(userId, { text: "a", platforms: ["TWITTER"], mediaUrls: [localMediaUrl(SHARED)], mode: "draft" });
    await createPostForUser(userId, { text: "b", platforms: ["TWITTER"], mediaUrls: [localMediaUrl(SHARED)], mode: "draft" });
    await createPostForUser(userId, { text: "c", platforms: ["TWITTER"], mediaUrls: [localMediaUrl(SOLO)], mode: "draft" });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    for (const n of [SHARED, SOLO, ORPHAN, FOREIGN]) {
      await import("node:fs/promises").then((fs) => fs.unlink(path.join(uploadsDir(), n)).catch(() => undefined));
    }
  });

  it("keeps a file another post still references", async () => {
    expect(await removeUnreferencedMedia([localMediaUrl(SHARED)])).toBe(0);
    expect(existsSync(path.join(uploadsDir(), SHARED))).toBe(true);
  });

  it("deletes a file once nothing references it", async () => {
    await prisma.post.deleteMany({ where: { userId, mediaUrls: { has: localMediaUrl(SOLO) } } });
    expect(await removeUnreferencedMedia([localMediaUrl(SOLO)])).toBe(1);
    expect(existsSync(path.join(uploadsDir(), SOLO))).toBe(false);
  });

  it("sweeps only old, unreferenced files of our own", async () => {
    await sweepOrphanMedia(); // default 24h guard: a file just written must survive (other leftovers may go)
    expect(existsSync(path.join(uploadsDir(), ORPHAN))).toBe(true);

    const swept = await sweepOrphanMedia({ minAgeMs: 0 });
    expect(swept.removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(path.join(uploadsDir(), ORPHAN))).toBe(false); // unreferenced and old enough
    expect(existsSync(path.join(uploadsDir(), SHARED))).toBe(true); // still referenced by two posts
    expect(existsSync(path.join(uploadsDir(), FOREIGN))).toBe(true); // not one of our files, never touched
  });
});
