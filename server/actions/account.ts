"use server";

import { auth, signOut } from "@/auth";
import { deleteUserAccount, type DeletedAccount } from "@/lib/account";

/**
 * Deletes the signed-in account. The person must type their own e-mail address: deletion is irreversible and takes every post,
 * account, token and setting with it. Signing out happens last, so a failure leaves the session usable and the data intact.
 */

export type DeleteAccountResult = { ok: true; deleted: DeletedAccount } | { ok: false; error: string };

const SESSION_EXPIRED = { ok: false, error: "Oturum süresi doldu" } as const;

export async function deleteAccountAction(confirm: string): Promise<DeleteAccountResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return SESSION_EXPIRED;

  const expected = (session.user.email ?? "").trim().toLowerCase();
  if (!expected || confirm.trim().toLowerCase() !== expected) {
    return { ok: false, error: "Onay için hesabının e-posta adresini birebir yazman gerekiyor." };
  }

  let deleted: DeletedAccount;
  try {
    deleted = await deleteUserAccount(userId);
  } catch {
    return { ok: false, error: "Hesap silinemedi. Birkaç dakika sonra tekrar dene." };
  }

  // Throws the redirect Next.js expects; nothing below runs
  await signOut({ redirectTo: "/login" });
  return { ok: true, deleted };
}
