import "server-only";
import type { Platform, PostPlatformStatus, PostStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type AnalyticsData = {
  /** Dated posts of the last 60 days, bucketed per day in the browser (user's timezone) */
  posts: { at: string; status: PostStatus }[];
  perPlatform: { platform: Platform; status: PostPlatformStatus; count: number }[];
};

/**
 * Numbers Synapse itself knows: what was scheduled, published or failed.
 * Reach and engagement need each platform's insights API (extra permissions / app review),
 * so they are intentionally not shown rather than faked.
 */
export async function getAnalytics(userId: string): Promise<AnalyticsData> {
  const since = new Date(Date.now() - 60 * 24 * 3600_000);

  const [posts, grouped] = await Promise.all([
    prisma.post.findMany({
      where: { userId, scheduledAt: { gte: since } },
      select: { scheduledAt: true, status: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.postPlatform.groupBy({ by: ["platform", "status"], where: { post: { userId } }, _count: true }),
  ]);

  return {
    posts: posts.map((p) => ({ at: p.scheduledAt!.toISOString(), status: p.status })),
    perPlatform: grouped.map((g) => ({ platform: g.platform, status: g.status, count: g._count })),
  };
}
