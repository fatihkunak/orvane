"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AiError, type AiErrorCode } from "@/lib/ai/errors";
import type { GenerateInput } from "@/lib/ai/prompt";
import { takeToken } from "@/lib/ai/rate-limit";
import { checkProviderForUser, fetchModelsForUser, generateForUser, type GenerateResult, type ProbeInput } from "@/lib/ai/service";
import { makePrimary, moveConfig, removeConfig, saveConfig, type SaveInput } from "@/lib/ai/store";

/** Like ActionResult, plus the error code so the UI can offer the right next step (e.g. "add a provider"). */
export type AiActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: AiErrorCode };

const GENERATE_LIMIT = { count: 20, windowMs: 10 * 60_000 };
const PROBE_LIMIT = { count: 30, windowMs: 10 * 60_000 };

function fail(e: unknown): { ok: false; error: string; code?: AiErrorCode } {
  if (e instanceof AiError) return { ok: false, error: e.message, code: e.code };
  console.error("[ai] unexpected error:", e instanceof Error ? e.name : typeof e); // never log messages: they could carry request data
  return { ok: false, error: "Beklenmeyen bir hata oluştu" };
}

async function signedIn(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

const SESSION_EXPIRED = { ok: false, error: "Oturum süresi doldu" } as const;

function limited(userId: string, bucket: "gen" | "probe"): { ok: false; error: string; code: AiErrorCode } | null {
  const cfg = bucket === "gen" ? GENERATE_LIMIT : PROBE_LIMIT;
  const t = takeToken(`${bucket}:${userId}`, cfg.count, cfg.windowMs);
  return t.ok ? null : { ok: false, error: `Çok fazla istek. ${t.retryAfterSec} sn sonra tekrar dene.`, code: "RATE_LIMIT" };
}

/** Adds or updates a provider (key, address, model). An empty key on an existing provider keeps the stored one. */
export async function saveAiProviderAction(input: SaveInput): Promise<AiActionResult> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  try {
    await saveConfig(userId, input);
    revalidatePath("/settings/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAiProviderAction(provider: string): Promise<AiActionResult> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  try {
    if (!(await removeConfig(userId, provider))) return { ok: false, error: "Sağlayıcı bulunamadı" };
    revalidatePath("/settings/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function makePrimaryAiProviderAction(provider: string): Promise<AiActionResult> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  try {
    if (!(await makePrimary(userId, provider))) return { ok: false, error: "Sağlayıcı bulunamadı" };
    revalidatePath("/settings/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveAiProviderAction(provider: string, dir: "up" | "down"): Promise<AiActionResult> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  try {
    await moveConfig(userId, provider, dir === "up" ? "up" : "down");
    revalidatePath("/settings/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Fetches the provider's real model list (typed key/address, or the stored ones). */
export async function fetchAiModelsAction(input: ProbeInput): Promise<AiActionResult<{ models: string[] }>> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  const blocked = limited(userId, "probe");
  if (blocked) return blocked;
  try {
    return { ok: true, models: await fetchModelsForUser(userId, input) };
  } catch (e) {
    return fail(e);
  }
}

/** Sends one tiny real request to check key, address and model. */
export async function checkAiProviderAction(input: ProbeInput): Promise<AiActionResult<{ ms: number }>> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  const blocked = limited(userId, "probe");
  if (blocked) return blocked;
  try {
    return { ok: true, ms: await checkProviderForUser(userId, input) };
  } catch (e) {
    return fail(e);
  }
}

/** Writes post drafts. Nothing is published: the user reviews and edits the result in the post form. */
export async function generatePostAction(input: GenerateInput): Promise<AiActionResult<{ result: GenerateResult }>> {
  const userId = await signedIn();
  if (!userId) return SESSION_EXPIRED;
  const blocked = limited(userId, "gen");
  if (blocked) return blocked;
  try {
    return { ok: true, result: await generateForUser(userId, input) };
  } catch (e) {
    return fail(e);
  }
}
