import "server-only";
import type { Platform, PostPlatformStatus, PostStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { providerFor } from "@/lib/social/providers";
import { PublishError, type PublishInput, type PublishResult } from "@/lib/social/publishers/shared";
import { publishToLinkedIn } from "@/lib/social/publishers/linkedin";
import { publishToTwitter } from "@/lib/social/publishers/twitter";
import { ReconnectRequiredError, getAccessToken } from "@/lib/social/tokens";

/** A platform row stuck in PUBLISHING longer than this is assumed to belong to a crashed run. */
export const STALE_PUBLISHING_MS = 10 * 60_000;

/** `text` is the platform's own text; null means the job's shared text. `mediaUrls` empty means the job's shared media */
export type PublishTarget = { id: string; platform: Platform; socialAccountId: string; text: string | null; mediaUrls: string[] };
export type PublishJob = { postId: string; text: string; mediaUrls: string[]; targets: PublishTarget[] };

/** The media a platform gets: its own when it has any, otherwise the post's shared media. */
export const mediaFor = (target: Pick<PublishTarget, "mediaUrls">, shared: readonly string[]): string[] => (target.mediaUrls.length ? target.mediaUrls : [...shared]);

const claimable = (now: Date) => ({
  OR: [
    { status: "PENDING" as const },
    { status: "PUBLISHING" as const, updatedAt: { lt: new Date(now.getTime() - STALE_PUBLISHING_MS) } },
  ],
});

/** Scheduled posts whose time has come and that still have something left to publish. */
export async function findDuePostIds(now = new Date(), limit = 100): Promise<string[]> {
  const posts = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now }, user: { suspendedAt: null }, platforms: { some: claimable(now) } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return posts.map((p) => p.id);
}

/** Loads what a publish run needs. Returns null when the post vanished or is no longer scheduled. */
export async function loadPublishJob(postId: string, now = new Date()): Promise<PublishJob | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, status: "SCHEDULED", user: { suspendedAt: null } },
    select: {
      id: true,
      text: true,
      mediaUrls: true,
      platforms: { where: claimable(now), select: { id: true, platform: true, socialAccountId: true, text: true, mediaUrls: true } },
    },
  });
  if (!post || post.platforms.length === 0) return null;
  return { postId: post.id, text: post.text, mediaUrls: post.mediaUrls, targets: post.platforms };
}

/**
 * Atomically takes ownership of one platform delivery. Only one concurrent run can win,
 * which is what prevents double posting when the cron and a "publish now" event overlap.
 */
export async function claimPlatform(postPlatformId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.postPlatform.updateMany({
    where: { id: postPlatformId, ...claimable(now) },
    data: { status: "PUBLISHING", error: null },
  });
  return count === 1;
}

export async function markPublished(postPlatformId: string, publishedPostId: string) {
  await prisma.postPlatform.update({
    where: { id: postPlatformId },
    data: { status: "PUBLISHED", publishedPostId, publishedAt: new Date(), error: null },
  });
}

export async function markFailed(postPlatformId: string, error: string) {
  await prisma.postPlatform.update({
    where: { id: postPlatformId },
    data: { status: "FAILED", error: error.slice(0, 1000) },
  });
}

/** Pure rule for the overall post status; null means "still in flight, leave it as is". */
export function derivePostStatus(platforms: PostPlatformStatus[]): PostStatus | null {
  if (platforms.length === 0) return null;
  if (platforms.some((s) => s === "PENDING" || s === "PUBLISHING")) return null;
  return platforms.every((s) => s === "PUBLISHED") ? "PUBLISHED" : "FAILED";
}

export async function finalizePost(postId: string): Promise<PostStatus | "IN_FLIGHT"> {
  const rows = await prisma.postPlatform.findMany({ where: { postId }, select: { status: true } });
  const status = derivePostStatus(rows.map((r) => r.status));
  if (!status) return "IN_FLIGHT";
  await prisma.post.update({
    where: { id: postId },
    data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
  });
  return status;
}

/** Access token for a platform row; a dead connection is reported as a non-retryable error. */
export async function publishContext(socialAccountId: string) {
  try {
    return await getAccessToken(socialAccountId);
  } catch (e) {
    if (e instanceof ReconnectRequiredError) throw new PublishError(e.message, false);
    throw e;
  }
}

/** Single-call publishing for X and LinkedIn (Threads is split into steps by the job). */
export async function publishDirect(target: PublishTarget, input: PublishInput): Promise<PublishResult> {
  const ctx = await publishContext(target.socialAccountId);
  const slug = providerFor(target.platform).slug;
  if (slug === "twitter") return publishToTwitter(ctx, input);
  if (slug === "linkedin") return publishToLinkedIn(ctx, input);
  throw new PublishError(`${target.platform} direct publishing is not supported`, false);
}
