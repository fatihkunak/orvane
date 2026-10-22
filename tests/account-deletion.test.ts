import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { deleteUserAccount, localMediaNames } from "@/lib/account";
import { createPostForUser } from "@/lib/post-create";
import { createApiToken } from "@/lib/api-tokens";

/** Real database: deletion must cascade every relation and remove the local media file it can reach. */

const UPLOADS = path.join(process.cwd(), ".uploads");
const MEDIA_NAME = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png";
const MEDIA_URL = `/api/media/${MEDIA_NAME}`;
const CLOUDINARY_URL = "https://res.cloudinary.com/example/image/upload/v1/orvane/x.png";

let victimId: string;
let survivorId: string;
const stamp = Date.now();

describe("account deletion", () => {
  beforeAll(async () => {
    victimId = (await prisma.user.create({ data: { email: `delete-me-${stamp}@test.local`, name: "Silinecek" } })).id;
    survivorId = (await prisma.user.create({ data: { email: `keep-me-${stamp}@test.local`, name: "Kalacak" } })).id;

    for (const [uid, pid] of [[victimId, "x-del"], [survivorId, "x-keep"]] as const) {
      await prisma.socialAccount.create({
        data: { userId: uid, provider: "TWITTER", platformUserId: pid, accessToken: encrypt("SECRET"), refreshToken: encrypt("SECRET") },
      });
    }

    // One post with a local media file; the Cloudinary URL is only checked in the pure helper below (the SSRF whitelist
    // needs a configured cloud name, which a test must not depend on)
    await createPostForUser(victimId, { text: "silinecek", platforms: ["TWITTER"], mediaUrls: [MEDIA_URL], mode: "draft" });
    await createPostForUser(victimId, { text: "medyasız", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" });
    await createPostForUser(survivorId, { text: "kalacak", platforms: ["TWITTER"], mediaUrls: [], mode: "draft" });

    await prisma.aiProviderConfig.create({ data: { userId: victimId, provider: "groq", apiKey: encrypt("k-123456"), position: 0 } });
    await createApiToken(victimId, "test");

    await mkdir(UPLOADS, { recursive: true });
    await writeFile(path.join(UPLOADS, MEDIA_NAME), Buffer.from("not-a-real-png-but-a-real-file"));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [victimId, survivorId] } } });
    await prisma.$disconnect();
  });

  it("only treats our own /api/media names as local files", () => {
    expect(localMediaNames([MEDIA_URL, CLOUDINARY_URL, "/api/media/../../etc/passwd", "/api/media/not-a-uuid.png"])).toEqual([MEDIA_NAME]);
  });

  it("removes the user with every relation and the local media file, leaving other users alone", async () => {
    const deleted = await deleteUserAccount(victimId);
    expect(deleted).toMatchObject({ posts: 2, socialAccounts: 1, apiTokens: 1, aiProviders: 1, mediaFiles: 1 });

    expect(await prisma.user.findUnique({ where: { id: victimId } })).toBeNull();
    expect(await prisma.post.count({ where: { userId: victimId } })).toBe(0);
    expect(await prisma.postPlatform.count({ where: { post: { userId: victimId } } })).toBe(0);
    expect(await prisma.socialAccount.count({ where: { userId: victimId } })).toBe(0);
    expect(await prisma.aiProviderConfig.count({ where: { userId: victimId } })).toBe(0);
    expect(await prisma.apiToken.count({ where: { userId: victimId } })).toBe(0);

    expect(existsSync(path.join(UPLOADS, MEDIA_NAME))).toBe(false);

    // The other account is untouched
    expect(await prisma.post.count({ where: { userId: survivorId } })).toBe(1);
    expect(await prisma.socialAccount.count({ where: { userId: survivorId } })).toBe(1);
  });
});
