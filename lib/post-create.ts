import "server-only";
import { prisma } from "@/lib/prisma";
import type { PostStatus } from "@/generated/prisma/enums";
import { PLATFORMS } from "@/lib/platforms";
import { createPostSchema, scheduleTimeSchema, type CreatePostInput } from "@/lib/validation/post";

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

/** Thrown inside the edit transaction to undo it with a message for the user. */
class EditRefused extends Error {}

/** Matches the post only while it is still in `status` AND still editable there (a scheduled post whose time has come is not). */
const editableAs = (userId: string, postId: string, status: PostStatus) => ({
  id: postId,
  userId,
  status,
  ...(status === "SCHEDULED" ? { scheduledAt: { gt: new Date() } } : {}),
});

/**
 * Saves the form over an existing post and, depending on the mode, keeps it a draft, schedules it or queues it for publishing.
 * A DRAFT, a SCHEDULED post that is still in the future and a FAILED one may be changed; anything already sent (or being sent
 * right now, i.e. a scheduled post whose time has come) is left alone.
 *
 * A FAILED post may be half published (X went out, LinkedIn failed). Its published platforms are never touched, dropped or sent
 * again; only the failed (and newly added) platforms go back to PENDING with the new text. It cannot become a draft.
 */
export async function updateDraftForUser(userId: string, postId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const existing = await prisma.post.findFirst({
    where: { id: postId, userId, OR: [{ status: "DRAFT" }, { status: "SCHEDULED", scheduledAt: { gt: new Date() } }, { status: "FAILED" }] },
    select: { status: true },
  });
  if (!existing) return { ok: false, error: "Gönderi bulunamadı ya da artık düzenlenemiyor" };

  const p = await prepare(userId, input);
  if (!p.ok) return p;
  const failed = existing.status === "FAILED";
  if (failed && p.data.mode === "draft") return { ok: false, error: "Yayınlanmaya çalışılmış bir gönderi taslağa çevrilemez; yeniden planla ya da şimdi yayınla" };

  const wanted = p.data.platforms;
  try {
    // Atomic: the row set follows the selection, and the status only moves if the post is STILL as editable as we read it
    const moved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({ where: editableAs(userId, postId, existing.status), data: p.postFields });
      if (count !== 1) return false;

      const published = failed ? (await tx.postPlatform.findMany({ where: { postId, status: "PUBLISHED" }, select: { platform: true } })).map((r) => r.platform) : [];
      if (published.some((platform) => !wanted.includes(platform))) throw new EditRefused("Yayınlanmış bir platform çıkarılamaz");
      if (failed && wanted.every((platform) => published.includes(platform))) throw new EditRefused("Yeniden denenecek platform kalmadı");

      await tx.postPlatform.deleteMany({ where: { postId, platform: { notIn: wanted } } });
      for (const platform of wanted) {
        if (published.includes(platform)) continue; // already out: never rewritten, never sent twice
        const row = p.platformRow(platform);
        await tx.postPlatform.upsert({
          where: { postId_platform: { postId, platform } },
          create: { postId, ...row },
          update: { socialAccountId: row.socialAccountId, text: row.text, mediaUrls: row.mediaUrls, ...(failed ? { status: "PENDING", error: null } : {}) },
        });
      }
      return true;
    });
    return moved ? { ok: true, id: postId, mode: p.data.mode } : { ok: false, error: "Gönderi artık düzenlenemiyor" };
  } catch (e) {
    if (e instanceof EditRefused) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Sends a FAILED post again, as it is: now (`scheduledAt` null) or at a chosen future time. Only the failed platforms go back to
 * PENDING; a platform that already published keeps its state and is never published again (the publisher only claims PENDING rows).
 * One atomic update on the FAILED status, so a double click queues it once.
 */
export async function retryFailedPostForUser(
  userId: string,
  postId: string,
  scheduledAt: string | null,
): Promise<{ ok: true; mode: "now" | "schedule" } | { ok: false; error: string }> {
  let when = new Date();
  if (scheduledAt !== null) {
    const parsed = scheduleTimeSchema.safeParse(scheduledAt);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz tarih" };
    when = new Date(parsed.data);
  }

  const queued = await prisma.$transaction(async (tx) => {
    const { count } = await tx.post.updateMany({ where: { id: postId, userId, status: "FAILED" }, data: { status: "SCHEDULED", scheduledAt: when } });
    if (count !== 1) return false;
    await tx.postPlatform.updateMany({ where: { postId, status: "FAILED" }, data: { status: "PENDING", error: null } });
    return true;
  });
  return queued ? { ok: true, mode: scheduledAt === null ? "now" : "schedule" } : { ok: false, error: "Gönderi bulunamadı ya da yeniden denenemiyor" };
}

/**
 * Moves an already scheduled post to another time without touching its text, platforms or media. Only a SCHEDULED post that has
 * not gone out can move, and the move is one atomic update: a post the publisher has claimed is left alone.
 */
export async function reschedulePostForUser(userId: string, postId: string, scheduledAt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = scheduleTimeSchema.safeParse(scheduledAt);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz tarih" };

  const { count } = await prisma.post.updateMany({
    where: { id: postId, userId, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    data: { scheduledAt: new Date(parsed.data) },
  });
  return count === 1 ? { ok: true } : { ok: false, error: "Gönderi bulunamadı ya da artık zamanlanabilir durumda değil" };
}
