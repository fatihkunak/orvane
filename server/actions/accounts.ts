"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { takeToken } from "@/lib/ai/rate-limit";
import { prisma } from "@/lib/prisma";
import { AppCredentialError, removeOwnCredentials, saveOwnCredentials } from "@/lib/social/app-credentials";
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

/** Saves the user's own X app keys (Client ID and Secret). The secret is stored encrypted and never returned. */
export async function saveAppKeysAction(input: { clientId: string; clientSecret: string }): Promise<ActionResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };
  if (!takeToken(`appkeys:${userId}`, 20, 10 * 60_000).ok) return { ok: false, error: "Çok fazla deneme, biraz bekle" };
  try {
    await saveOwnCredentials(userId, "twitter", String(input.clientId ?? ""), String(input.clientSecret ?? ""));
  } catch (e) {
    if (e instanceof AppCredentialError) return { ok: false, error: e.message };
    console.error("[accounts] saving app keys failed:", e instanceof Error ? e.name : typeof e); // never log values
    return { ok: false, error: "Anahtarlar kaydedilemedi" };
  }
  revalidatePath("/accounts");
  return { ok: true };
}

export async function removeAppKeysAction(): Promise<ActionResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };
  try {
    if (!(await removeOwnCredentials(userId, "twitter"))) return { ok: false, error: "Kayıtlı anahtar yok" };
  } catch (e) {
    if (e instanceof AppCredentialError) return { ok: false, error: e.message };
    return { ok: false, error: "Anahtarlar kaldırılamadı" };
  }
  revalidatePath("/accounts");
  return { ok: true };
}
