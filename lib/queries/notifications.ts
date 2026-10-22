import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * What the topbar bell shows. Deliberately derived from post state instead of a notifications table: there is no read/unread
 * bookkeeping to get wrong, and every entry is something the person can act on right now.
 */

export interface TopbarNotification {
  id: string;
  kind: "failed" | "upcoming";
  /** Short text snippet of the post */
  text: string;
  /** ISO: when it failed (last attempt) or when it is due */
  at: string;
  /** First publish error, for failures */
  error: string | null;
}

const HOUR = 60 * 60_000;
const SNIPPET = 90;

const snippet = (t: string) => (t.length > SNIPPET ? `${t.slice(0, SNIPPET)}…` : t);

export async function getTopbarData(userId: string): Promise<{ notifications: TopbarNotification[]; hasFailure: boolean }> {
  const now = new Date();
  const [failed, upcoming] = await Promise.all([
    prisma.post.findMany({
      where: { userId, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { platforms: { select: { error: true } } },
    }),
    // Only the next day: a post a week out is not a notification
    prisma.post.findMany({
      where: { userId, status: "SCHEDULED", scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
  ]);

  const notifications: TopbarNotification[] = [
    ...failed.map((p) => ({
      id: p.id,
      kind: "failed" as const,
      text: snippet(p.text),
      at: p.updatedAt.toISOString(),
      error: p.platforms.find((x) => x.error)?.error ?? null,
    })),
    ...upcoming.map((p) => ({
      id: p.id,
      kind: "upcoming" as const,
      text: snippet(p.text),
      at: p.scheduledAt!.toISOString(),
      error: null,
    })),
  ];

  return { notifications, hasFailure: failed.length > 0 };
}
