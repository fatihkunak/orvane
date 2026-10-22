import "server-only";
import type { Platform } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { PostDTO } from "@/lib/post-types";

/** Scheduled/published/failed posts of a user (drafts have no date, so they are not calendar items). */
export async function listDatedPosts(userId: string, opts: { take?: number } = {}): Promise<PostDTO[]> {
  const posts = await prisma.post.findMany({
    where: { userId, scheduledAt: { not: null } },
    include: { platforms: { select: { platform: true, error: true, mediaUrls: true } } },
    orderBy: { scheduledAt: "asc" },
    take: opts.take ?? 500,
  });

  return posts.map((p) => ({
    id: p.id,
    text: p.text,
    platforms: p.platforms.map((x) => x.platform),
    scheduledAt: p.scheduledAt!.toISOString(),
    status: p.status,
    hasMedia: p.mediaUrls.length > 0 || p.platforms.some((x) => x.mediaUrls.length > 0),
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

/** A draft as the "Taslaklar" list shows it. */
export interface DraftDTO {
  id: string;
  text: string;
  platforms: { platform: Platform; ownText: boolean; hasMedia: boolean }[];
  hasMedia: boolean;
  createdAt: string;
}

export async function listDrafts(userId: string): Promise<DraftDTO[]> {
  const posts = await prisma.post.findMany({
    where: { userId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { platforms: { select: { platform: true, text: true, mediaUrls: true }, orderBy: { platform: "asc" } } },
  });
  return posts.map((p) => ({
    id: p.id,
    text: p.text,
    platforms: p.platforms.map((x) => ({ platform: x.platform, ownText: !!x.text, hasMedia: x.mediaUrls.length > 0 })),
    hasMedia: p.mediaUrls.length > 0 || p.platforms.some((x) => x.mediaUrls.length > 0),
    createdAt: p.createdAt.toISOString(),
  }));
}

/** What the post form needs to continue a draft. Null when it is not the user's or no longer a draft. */
export interface DraftForm {
  id: string;
  text: string;
  platforms: Platform[];
  overrides: Partial<Record<Platform, string>>;
  mediaUrls: string[];
  mediaByPlatform: Partial<Record<Platform, string[]>>;
}

export async function getDraftForForm(userId: string, id: string): Promise<DraftForm | null> {
  const p = await prisma.post.findFirst({
    where: { id, userId, status: "DRAFT" },
    include: { platforms: { select: { platform: true, text: true, mediaUrls: true } } },
  });
  if (!p) return null;
  const overrides: DraftForm["overrides"] = {};
  const mediaByPlatform: DraftForm["mediaByPlatform"] = {};
  for (const x of p.platforms) {
    if (x.text) overrides[x.platform] = x.text;
    if (x.mediaUrls.length) mediaByPlatform[x.platform] = x.mediaUrls;
  }
  // When every platform has its own text the post's text is only a stand-in for lists: do not show it as shared text
  const allOwn = p.platforms.length > 0 && p.platforms.every((x) => !!x.text);
  return { id: p.id, text: allOwn ? "" : p.text, platforms: p.platforms.map((x) => x.platform), overrides, mediaUrls: p.mediaUrls, mediaByPlatform };
}
