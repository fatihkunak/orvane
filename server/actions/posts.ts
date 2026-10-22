"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { inngest, POST_PUBLISH_REQUESTED, publishEventId } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { createPostForUser, reschedulePostForUser, updateDraftForUser, type CreatePostResult } from "@/lib/post-create";
import { removeUnreferencedMedia } from "@/lib/media-cleanup";
import type { CreatePostInput } from "@/lib/validation/post";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** "Publish now" does not wait for the next cron tick. If Inngest is unreachable the every-minute scheduler still picks the post up. */
async function afterSave(postId: string, mode: "draft" | "schedule" | "now") {
  if (mode === "now") {
    try {
      await inngest.send({ id: publishEventId(postId), name: POST_PUBLISH_REQUESTED, data: { postId } });
    } catch (e) {
      console.warn("inngest.send failed, the scheduler will publish it", e);
    }
  }
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/drafts");
}

const SESSION_EXPIRED = { ok: false, error: "Oturum süresi doldu, tekrar giriş yap" } as const;

/** Creates a post + one PostPlatform per selected platform. */
export async function createPostAction(input: CreatePostInput): Promise<ActionResult<{ id: string }>> {
  const userId = (await auth())?.user?.id;
  if (!userId) return SESSION_EXPIRED;
  const created: CreatePostResult = await createPostForUser(userId, input);
  if (!created.ok) return created;
  await afterSave(created.id, created.mode);
  return { ok: true, id: created.id };
}

/** Saves the form over an existing draft (opened from "Taslaklar") and drafts, schedules or publishes it. */
export async function updateDraftAction(postId: string, input: CreatePostInput): Promise<ActionResult<{ id: string }>> {
  const userId = (await auth())?.user?.id;
  if (!userId) return SESSION_EXPIRED;
  const saved: CreatePostResult = await updateDraftForUser(userId, postId, input);
  if (!saved.ok) return saved;
  await afterSave(saved.id, saved.mode);
  return { ok: true, id: saved.id };
}

/** Moves a scheduled post to another time (quick reschedule from the calendar). Text and media are untouched. */
export async function reschedulePostAction(postId: string, scheduledAt: string): Promise<ActionResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return SESSION_EXPIRED;
  const r = await reschedulePostForUser(userId, postId, scheduledAt);
  if (!r.ok) return r;
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Deletes a post that has not been published yet, together with media files nothing references any more. */
export async function deletePostAction(postId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };

  const post = await prisma.post.findFirst({
    where: { id: postId, userId, status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } },
    select: { mediaUrls: true, platforms: { select: { mediaUrls: true } } },
  });
  if (!post) return { ok: false, error: "Gönderi silinemedi (yayınlanmış olabilir)" };

  // deleteMany still scopes by owner, so a status change between the read and the delete cannot remove another row
  const { count } = await prisma.post.deleteMany({
    where: { id: postId, userId, status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } },
  });
  if (!count) return { ok: false, error: "Gönderi silinemedi (yayınlanmış olabilir)" };

  // Shared files survive: removeUnreferencedMedia checks every post and platform row
  await removeUnreferencedMedia([...post.mediaUrls, ...post.platforms.flatMap((p) => p.mediaUrls)]);

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/drafts");
  return { ok: true };
}
