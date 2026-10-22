import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Account deletion. The rows go through the database's own cascade (`User` → posts, platforms, social accounts, API tokens,
 * provider configs), and the media files that live on this machine are removed afterwards. Cloudinary objects are NOT deleted:
 * the app never calls Cloudinary's destroy endpoint, so PRIVACY.md tells the person to remove those from their own account.
 */

const LOCAL_PREFIX = "/api/media/";
/** Our own generated names only (UUID + allowed extension): a stored URL must never be able to point outside `.uploads` */
const LOCAL_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|mp4)$/;

export function localMediaNames(urls: Iterable<string>): string[] {
  const names = new Set<string>();
  for (const u of urls) {
    if (!u.startsWith(LOCAL_PREFIX)) continue;
    const name = u.slice(LOCAL_PREFIX.length);
    if (LOCAL_NAME.test(name)) names.add(name);
  }
  return [...names];
}

export interface DeletedAccount {
  posts: number;
  socialAccounts: number;
  apiTokens: number;
  aiProviders: number;
  mediaFiles: number;
}

/**
 * Deletes the user and everything hanging off them. Returns what was removed, for the confirmation message. Media files are
 * best-effort: a missing file must not make the deletion look failed.
 */
export async function deleteUserAccount(userId: string): Promise<DeletedAccount> {
  const posts = await prisma.post.findMany({
    where: { userId },
    select: { mediaUrls: true, platforms: { select: { mediaUrls: true } } },
  });
  const files = localMediaNames(posts.flatMap((p) => [...p.mediaUrls, ...p.platforms.flatMap((x) => x.mediaUrls)]));

  const [socialAccounts, apiTokens, aiProviders] = await Promise.all([
    prisma.socialAccount.count({ where: { userId } }),
    prisma.apiToken.count({ where: { userId } }),
    prisma.aiProviderConfig.count({ where: { userId } }),
  ]);

  // One delete: every relation is declared onDelete: Cascade, so this cannot leave half a user behind
  await prisma.user.delete({ where: { id: userId } });

  let mediaFiles = 0;
  for (const name of files) {
    try {
      await unlink(path.join(process.cwd(), ".uploads", name));
      mediaFiles++;
    } catch {
      // already gone or never written on this machine
    }
  }

  return { posts: posts.length, socialAccounts, apiTokens, aiProviders, mediaFiles };
}
