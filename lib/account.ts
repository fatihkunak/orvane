import "server-only";
import { prisma } from "@/lib/prisma";
import { removeUnreferencedMedia } from "@/lib/media-cleanup";

/**
 * Account deletion. The rows go through the database's own cascade (`User` → posts, platforms, social accounts, API tokens,
 * provider configs); the media files that live on this machine are removed afterwards, and only if nothing else references
 * them. Cloudinary objects are NOT deleted: the app never calls Cloudinary's destroy endpoint, so PRIVACY.md tells the person
 * to remove those from their own account.
 */

export interface DeletedAccount {
  posts: number;
  socialAccounts: number;
  apiTokens: number;
  aiProviders: number;
  mediaFiles: number;
}

export async function deleteUserAccount(userId: string): Promise<DeletedAccount> {
  const posts = await prisma.post.findMany({
    where: { userId },
    select: { mediaUrls: true, platforms: { select: { mediaUrls: true } } },
  });
  const urls = posts.flatMap((p) => [...p.mediaUrls, ...p.platforms.flatMap((x) => x.mediaUrls)]);

  const [socialAccounts, apiTokens, aiProviders] = await Promise.all([
    prisma.socialAccount.count({ where: { userId } }),
    prisma.apiToken.count({ where: { userId } }),
    prisma.aiProviderConfig.count({ where: { userId } }),
  ]);

  // One delete: every relation is declared onDelete: Cascade, so this cannot leave half a user behind
  await prisma.user.delete({ where: { id: userId } });

  // After the rows are gone: a file another post still points at stays on disk
  const mediaFiles = await removeUnreferencedMedia(urls);

  return { posts: posts.length, socialAccounts, apiTokens, aiProviders, mediaFiles };
}
