import "server-only";
import { prisma } from "@/lib/prisma";
import { PLATFORMS } from "@/lib/platforms";
import { createPostSchema, type CreatePostInput } from "@/lib/validation/post";

export type PostMode = "draft" | "schedule" | "now";
export type CreatePostResult = { ok: true; id: string; mode: PostMode } | { ok: false; error: string };

/** Validates the input and resolves the connected account of every selected platform (oldest one per platform). */
async function prepare(userId: string, input: CreatePostInput) {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" };
  const data = parsed.data;

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, provider: { in: data.platforms } },
    orderBy: { createdAt: "asc" },
    select: { id: true, provider: true },
  });
  const accountFor = new Map<string, string>();
  for (const a of accounts) if (!accountFor.has(a.provider)) accountFor.set(a.provider, a.id);

  const missing = data.platforms.filter((p) => !accountFor.has(p));
  if (missing.length) return { ok: false as const, error: `Önce hesabını bağla: ${missing.map((p) => PLATFORMS[p].label).join(", ")}` };

  const when = data.mode === "now" ? new Date() : data.mode === "schedule" ? new Date(data.scheduledAt!) : null;
  const platformRow = (p: (typeof data.platforms)[number]) => ({
    platform: p,
    socialAccountId: accountFor.get(p)!,
    text: data.overrides[p] ?? null,
    mediaUrls: data.mediaByPlatform[p] ?? [],
  });
  return {
    ok: true as const,
    data,
    when,
    platformRow,
    postFields: {
      // The post's own text is the default; with every platform overridden, the first one stands in so lists still show something
      text: data.text || data.overrides[data.platforms[0]!]!,
      mediaUrls: data.mediaUrls,
      status: data.mode === "draft" ? ("DRAFT" as const) : ("SCHEDULED" as const),
      scheduledAt: when,
    },
  };
}

/**
 * Stores a post with one PostPlatform per selected platform. Shared by the post form's server action and the MCP endpoint.
 * It never publishes anything itself: "now" posts are picked up by the caller (event) or the scheduler.
 */
export async function createPostForUser(userId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const p = await prepare(userId, input);
  if (!p.ok) return p;
  const post = await prisma.post.create({
    data: { userId, ...p.postFields, platforms: { create: p.data.platforms.map(p.platformRow) } },
    select: { id: true },
  });
  return { ok: true, id: post.id, mode: p.data.mode };
}

/**
 * Saves the form over an existing post and, depending on the mode, keeps it a draft, schedules it or queues it for publishing.
 * A DRAFT and a SCHEDULED post that is still in the future may be changed; anything already sent (or being sent right now, i.e.
 * a scheduled post whose time has come) is left alone.
 */
export async function updateDraftForUser(userId: string, postId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const editable = { id: postId, userId, OR: [{ status: "DRAFT" as const }, { status: "SCHEDULED" as const, scheduledAt: { gt: new Date() } }] };
  const existing = await prisma.post.findFirst({ where: editable, select: { status: true } });
  if (!existing) return { ok: false, error: "Gönderi bulunamadı ya da artık düzenlenemiyor" };

  const p = await prepare(userId, input);
  if (!p.ok) return p;

  const wanted = p.data.platforms;
  // Atomic: the row set follows the selection, and the status only moves if the post is STILL editable
  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.post.updateMany({ where: editable, data: p.postFields });
    if (count !== 1) return false;
    await tx.postPlatform.deleteMany({ where: { postId, platform: { notIn: wanted } } });
    for (const platform of wanted) {
      const row = p.platformRow(platform);
      await tx.postPlatform.upsert({
        where: { postId_platform: { postId, platform } },
        create: { postId, ...row },
        update: { socialAccountId: row.socialAccountId, text: row.text, mediaUrls: row.mediaUrls },
      });
    }
    return true;
  });
  return moved ? { ok: true, id: postId, mode: p.data.mode } : { ok: false, error: "Gönderi artık düzenlenemiyor" };
}
