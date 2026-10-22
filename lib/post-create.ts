import "server-only";
import { prisma } from "@/lib/prisma";
import { PLATFORMS } from "@/lib/platforms";
import { createPostSchema, type CreatePostInput } from "@/lib/validation/post";

export type CreatePostResult = { ok: true; id: string; mode: "draft" | "schedule" | "now" } | { ok: false; error: string };

/**
 * Validates and stores a post with one PostPlatform per selected platform. Shared by the post form's server action and the
 * MCP endpoint. It never publishes anything itself: "now" posts are picked up by the caller (event) or the scheduler.
 */
export async function createPostForUser(userId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" };
  const { text, platforms, overrides, mediaUrls, mode, scheduledAt } = parsed.data;

  // Each platform needs a connected account. Use the oldest one per platform.
  const accounts = await prisma.socialAccount.findMany({
    where: { userId, provider: { in: platforms } },
    orderBy: { createdAt: "asc" },
    select: { id: true, provider: true },
  });
  const accountFor = new Map<string, string>();
  for (const a of accounts) if (!accountFor.has(a.provider)) accountFor.set(a.provider, a.id);

  const missing = platforms.filter((p) => !accountFor.has(p));
  if (missing.length) {
    return { ok: false, error: `Önce hesabını bağla: ${missing.map((p) => PLATFORMS[p].label).join(", ")}` };
  }

  const when = mode === "now" ? new Date() : mode === "schedule" ? new Date(scheduledAt!) : null;

  const post = await prisma.post.create({
    data: {
      userId,
      // The post's own text is the default; with every platform overridden, the first one stands in so lists still show something
      text: text || overrides[platforms[0]!]!,
      mediaUrls,
      status: mode === "draft" ? "DRAFT" : "SCHEDULED",
      scheduledAt: when,
      platforms: { create: platforms.map((p) => ({ platform: p, socialAccountId: accountFor.get(p)!, text: overrides[p] ?? null })) },
    },
    select: { id: true },
  });
  return { ok: true, id: post.id, mode };
}
