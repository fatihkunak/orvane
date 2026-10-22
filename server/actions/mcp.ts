"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createApiToken, revokeApiToken, TokenError } from "@/lib/api-tokens";

export type TokenActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Creates a token for the MCP endpoint. The full token is returned ONCE here and cannot be shown again. */
export async function createApiTokenAction(name: string): Promise<TokenActionResult<{ token: string }>> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };
  try {
    const { token } = await createApiToken(userId, name);
    revalidatePath("/settings/mcp");
    return { ok: true, token };
  } catch (e) {
    if (e instanceof TokenError) return { ok: false, error: e.message };
    console.error("[mcp] token creation failed:", e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "Beklenmeyen bir hata oluştu" };
  }
}

export async function revokeApiTokenAction(id: string): Promise<TokenActionResult> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, error: "Oturum süresi doldu" };
  if (!(await revokeApiToken(userId, id))) return { ok: false, error: "Belirteç bulunamadı" };
  revalidatePath("/settings/mcp");
  return { ok: true };
}
