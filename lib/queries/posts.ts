import "server-only";
import { prisma } from "@/lib/prisma";
import type { PostDTO } from "@/lib/post-types";

/** Scheduled/published/failed posts of a user (drafts have no date, so they are not calendar items). */
export async function listDatedPosts(userId: string, opts: { take?: number } = {}): Promise<PostDTO[]> {
  const posts = await prisma.post.findMany({
    where: { userId, scheduledAt: { not: null } },
    include: { platforms: { select: { platform: true, error: true } } },
    orderBy: { scheduledAt: "asc" },
    take: opts.take ?? 500,
  });

  return posts.map((p) => ({
    id: p.id,
    text: p.text,
    platforms: p.platforms.map((x) => x.platform),
    scheduledAt: p.scheduledAt!.toISOString(),
    status: p.status,
    hasMedia: p.mediaUrls.length > 0,
    error: p.platforms.find((x) => x.error)?.error ?? null,
  }));
}

export async function postCounts(userId: string) {
  const grouped = await prisma.post.groupBy({ by: ["status"], where: { userId }, _count: true });
  const by = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<Record<string, number>>;
  const total = grouped.reduce((n, g) => n + g._count, 0);
  return {
    total,
    scheduled: by.SCHEDULED ?? 0,
    published: by.PUBLISHED ?? 0,
    drafts: by.DRAFT ?? 0,
    failed: by.FAILED ?? 0,
  };
}
