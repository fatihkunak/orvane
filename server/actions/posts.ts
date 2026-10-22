"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { inngest, POST_PUBLISH_REQUESTED, publishEventId } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { createPostForUser } from "@/lib/post-create";
import type { CreatePostInput } from "@/lib/validation/post";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Creates a post + one PostPlatform per selected platform. */
export async function createPostAction(input: CreatePostInput): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu, tekrar giriş yap" };

  const created = await createPostForUser(userId, input);
  if (!created.ok) return created;
  const post = { id: created.id };
  const mode = created.mode;

  // "Publish now": don't wait for the next cron tick. If Inngest is unreachable the
  // every-minute scheduler still picks the post up, so a failed send is not an error.
  if (mode === "now") {
    try {
      await inngest.send({ id: publishEventId(post.id), name: POST_PUBLISH_REQUESTED, data: { postId: post.id } });
    } catch (e) {
      console.warn("inngest.send failed, the scheduler will publish it", e);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true, id: post.id };
}

/** Deletes a post that has not been published yet. */
export async function deletePostAction(postId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };

  // deleteMany scopes by owner, so another user's id simply matches nothing
  const { count } = await prisma.post.deleteMany({
    where: { id: postId, userId, status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } },
  });
  if (!count) return { ok: false, error: "Gönderi silinemedi (yayınlanmış olabilir)" };

  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  return { ok: true };
}
