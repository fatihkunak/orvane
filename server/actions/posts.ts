"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { inngest, POST_PUBLISH_REQUESTED, publishEventId } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { PLATFORMS } from "@/lib/platforms";
import { createPostSchema, type CreatePostInput } from "@/lib/validation/post";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Creates a post + one PostPlatform per selected platform. */
export async function createPostAction(input: CreatePostInput): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu, tekrar giriş yap" };

  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" };
  const { text, platforms, overrides, mediaUrls, mode, scheduledAt } = parsed.data;

  // Each platform needs a connected account (Adım 6). Use the oldest one per platform.
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
