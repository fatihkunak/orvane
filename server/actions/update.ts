"use server";

import { auth } from "@/auth";
import { takeToken } from "@/lib/ai/rate-limit";
import { checkForUpdate, isUpdateOwner, startUpdate, updateEnabled, type UpdateStatus } from "@/lib/update";

/**
 * Self-update endpoints. Both are owner-only and off unless ORVANE_UPDATE_ENABLED=1: the update runs code from the repository
 * on this machine and restarts the app, so a normal account (or even the admin token) must never reach it.
 */

export type UpdateActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SESSION_EXPIRED = { ok: false, error: "Oturum süresi doldu" } as const;

function guard(email: string | null | undefined): { ok: false; error: string } | null {
  if (!updateEnabled()) return { ok: false, error: "Güncelleme bu kurulumda kapalı (ORVANE_UPDATE_ENABLED=1 gerekir)." };
  if (!isUpdateOwner(email)) return { ok: false, error: "Bu işlem yalnızca kurulumun sahibine açık (ORVANE_OWNER_EMAIL)." };
  return null;
}

export async function checkUpdateAction(): Promise<UpdateActionResult<{ status: UpdateStatus }>> {
  const session = await auth();
  if (!session?.user) return SESSION_EXPIRED;
  const blocked = guard(session.user.email);
  if (blocked) return blocked;
  try {
    return { ok: true, status: await checkForUpdate() };
  } catch {
    return { ok: false, error: "Sürüm bilgisi alınamadı" };
  }
}

/** Starts `deploy/update.cmd` detached. The app restarts, so the reply is only a "started", never a result. */
export async function runUpdateAction(): Promise<UpdateActionResult<{ message: string }>> {
  const session = await auth();
  if (!session?.user?.id) return SESSION_EXPIRED;
  const blocked = guard(session.user.email);
  if (blocked) return blocked;

  const limit = takeToken(`update:${session.user.id}`, 3, 10 * 60_000);
  if (!limit.ok) return { ok: false, error: `Çok fazla güncelleme denemesi. ${limit.retryAfterSec} sn sonra dene.` };

  try {
    const { logPath } = await startUpdate();
    return {
      ok: true,
      message: `Güncelleme başladı. Uygulama 1-2 dakika içinde yeniden başlayacak; bitince sayfayı yenile. Kayıt: ${logPath}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Güncelleme başlatılamadı" };
  }
}
