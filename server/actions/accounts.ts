"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/server/actions/posts";

/** Removes a connected account (and its stored tokens). */
export async function disconnectAccountAction(accountId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };

  // Deleting would silently drop the platform from posts that are still waiting to be published
  const waiting = await prisma.postPlatform.count({
    where: { socialAccountId: accountId, socialAccount: { userId }, status: { in: ["PENDING", "PUBLISHING"] }, post: { status: "SCHEDULED" } },
  });
  if (waiting > 0) return { ok: false, error: `Bu hesapta bekleyen ${waiting} planlı gönderi var, önce onları sil` };

  const { count } = await prisma.socialAccount.deleteMany({ where: { id: accountId, userId } });
  if (!count) return { ok: false, error: "Hesap bulunamadı" };

  revalidatePath("/accounts");
  return { ok: true };
}
