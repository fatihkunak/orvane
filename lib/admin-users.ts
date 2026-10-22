import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * What the fatihgo admin panel can see and do about Orvane users. It exposes counts and metadata only: no tokens, no AI
 * keys, no OAuth secrets (those stay encrypted in the database and never leave the server).
 */
export const ADMIN_PAGE_SIZE = 25;

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  suspendedAt: string | null;
  accounts: string[];
  posts: { total: number; draft: number; scheduled: number; published: number; failed: number };
  lastPostAt: string | null;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

export async function listUsers(opts: { q?: string; page?: number } = {}): Promise<{ total: number; page: number; pageSize: number; users: AdminUserRow[] }> {
  const q = opts.q?.trim().slice(0, 100);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: { id: true, email: true, name: true, createdAt: true, suspendedAt: true, socialAccounts: { select: { provider: true } } },
    }),
  ]);

  const ids = users.map((u) => u.id);
  const grouped = ids.length
    ? await prisma.post.groupBy({ by: ["userId", "status"], where: { userId: { in: ids } }, _count: true, _max: { createdAt: true } })
    : [];

  return {
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    users: users.map((u) => {
      const mine = grouped.filter((g) => g.userId === u.id);
      const n = (s: string) => mine.find((g) => g.status === s)?._count ?? 0;
      const last = mine.map((g) => g._max.createdAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt.toISOString(),
        suspendedAt: iso(u.suspendedAt),
        accounts: [...new Set(u.socialAccounts.map((a) => a.provider))],
        posts: { total: mine.reduce((s, g) => s + g._count, 0), draft: n("DRAFT"), scheduled: n("SCHEDULED"), published: n("PUBLISHED"), failed: n("FAILED") },
        lastPostAt: iso(last),
      };
    }),
  };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      suspendedAt: true,
      socialAccounts: { select: { provider: true, username: true, displayName: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      aiProviders: { select: { provider: true, model: true, position: true }, orderBy: { position: "asc" } },
      apiTokens: { select: { name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, text: true, status: true, scheduledAt: true, createdAt: true, platforms: { select: { platform: true, status: true, error: true } } },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    suspendedAt: iso(user.suspendedAt),
    accounts: user.socialAccounts.map((a) => ({
      platform: a.provider,
      handle: a.username,
      name: a.displayName,
      tokenExpiresAt: iso(a.expiresAt),
      connectedAt: a.createdAt.toISOString(),
    })),
    // Which providers are set up, never their keys
    aiProviders: user.aiProviders.map((p) => ({ provider: p.provider, model: p.model, position: p.position })),
    apiTokens: user.apiTokens.map((t) => ({ name: t.name, prefix: t.prefix, lastUsedAt: iso(t.lastUsedAt), revoked: !!t.revokedAt, createdAt: t.createdAt.toISOString() })),
    recentPosts: user.posts.map((p) => ({
      id: p.id,
      status: p.status,
      scheduledAt: iso(p.scheduledAt),
      createdAt: p.createdAt.toISOString(),
      text: p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text,
      platforms: p.platforms.map((x) => ({ platform: x.platform, status: x.status, error: x.error })),
    })),
  };
}

/**
 * Suspends or restores a user. Suspending also takes the user's SCHEDULED posts back to DRAFT: publishing skips suspended users,
 * and without this the overdue posts would all go out at once the moment the account is restored.
 */
export async function setSuspended(id: string, suspended: boolean): Promise<{ suspendedAt: string | null; postsReturnedToDraft: number } | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: { suspendedAt: true } });
  if (!user) return null;
  if (!suspended) {
    await prisma.user.update({ where: { id }, data: { suspendedAt: null } });
    return { suspendedAt: null, postsReturnedToDraft: 0 };
  }
  const now = user.suspendedAt ?? new Date();
  const [, moved] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { suspendedAt: now } }),
    prisma.post.updateMany({ where: { userId: id, status: "SCHEDULED" }, data: { status: "DRAFT" } }),
  ]);
  return { suspendedAt: now.toISOString(), postsReturnedToDraft: moved.count };
}

export async function adminStats(now = new Date()) {
  const day = 24 * 3600_000;
  const since = (d: number) => new Date(now.getTime() - d * day);
  const [users, suspended, new7, new30, postsByStatus, accountsByPlatform, activeTokens] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
    prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
    prisma.post.groupBy({ by: ["status"], _count: true }),
    prisma.socialAccount.groupBy({ by: ["provider"], _count: true }),
    prisma.apiToken.count({ where: { revokedAt: null } }),
  ]);
  return {
    users: { total: users, suspended, last7d: new7, last30d: new30 },
    posts: Object.fromEntries(postsByStatus.map((g) => [g.status.toLowerCase(), g._count])) as Record<string, number>,
    accounts: Object.fromEntries(accountsByPlatform.map((g) => [g.provider, g._count])) as Record<string, number>,
    activeApiTokens: activeTokens,
  };
}
