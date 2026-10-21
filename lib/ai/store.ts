import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { AiError } from "@/lib/ai/errors";
import { API_KEY_RE, baseUrlEditable, getProvider, type ProviderInfo } from "@/lib/ai/providers";
import { assertSafeBaseUrl } from "@/lib/ai/security";

/**
 * Per-user provider settings. The API key is stored AES-256-GCM encrypted and only ever decrypted here, on the server, for
 * the length of one request. It is never returned to the browser: the settings UI only learns THAT a key exists.
 */

/** What the settings page may see. */
export interface ProviderView {
  provider: string;
  hasKey: boolean;
  baseUrl: string | null;
  model: string | null;
  position: number;
}

/** What a provider call needs (server only, contains the decrypted key). */
export interface ChainEntry {
  provider: string;
  info: ProviderInfo;
  apiKey: string;
  /** The user's typed address (custom/alibaba/local), if any */
  baseUrl: string | null;
  model: string | null;
  /** The stored key could not be decrypted (TOKEN_ENCRYPTION_KEY changed): treat as missing */
  keyBroken: boolean;
}

export async function listConfigs(userId: string): Promise<ProviderView[]> {
  const rows = await prisma.aiProviderConfig.findMany({ where: { userId }, orderBy: { position: "asc" } });
  return rows
    .filter((r) => getProvider(r.provider))
    .map((r) => ({ provider: r.provider, hasKey: !!r.apiKey, baseUrl: r.baseUrl, model: r.model, position: r.position }));
}

/** The user's providers in order: the primary first, then the backups. */
export async function loadChain(userId: string): Promise<ChainEntry[]> {
  const rows = await prisma.aiProviderConfig.findMany({ where: { userId }, orderBy: { position: "asc" } });
  const out: ChainEntry[] = [];
  for (const r of rows) {
    const info = getProvider(r.provider);
    if (!info) continue; // provider removed from the registry
    let apiKey = "";
    let keyBroken = false;
    if (r.apiKey) {
      try {
        apiKey = decrypt(r.apiKey);
      } catch {
        keyBroken = true;
      }
    }
    out.push({ provider: r.provider, info, apiKey, baseUrl: r.baseUrl, model: r.model, keyBroken });
  }
  return out;
}

export interface SaveInput {
  provider: string;
  /** Empty or missing on an existing provider keeps the stored key */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const MODEL_RE = /^[^\s\x00-\x1f]{1,200}$/;

/** Cleans a model id; empty means "use the default". */
export function cleanModel(raw: string | undefined): string | null {
  const m = (raw ?? "").trim();
  if (!m) return null;
  if (!MODEL_RE.test(m)) throw new AiError("BAD_CONFIG", "Model kimliği boşluk içeremez (en fazla 200 karakter).");
  return m;
}

export function cleanKey(raw: string | undefined): string | null {
  const k = (raw ?? "").trim();
  if (!k) return null;
  if (!API_KEY_RE.test(k)) throw new AiError("BAD_CONFIG", "Anahtar geçersiz görünüyor (boşluk/özel karakter olmamalı, 8-512 karakter).");
  return k;
}

/** The address to store: only where the provider lets the user choose it, and only if it passes the SSRF check. */
export async function cleanBaseUrl(info: ProviderInfo, raw: string | undefined): Promise<string | null> {
  if (!baseUrlEditable(info)) return null;
  const url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!url) {
    if (!info.baseUrl) throw new AiError("BAD_CONFIG", `${info.label} için adres gerekli.`);
    return null; // local server: the default address
  }
  await assertSafeBaseUrl(url);
  return url;
}

export async function saveConfig(userId: string, input: SaveInput): Promise<void> {
  const info = getProvider(input.provider);
  if (!info) throw new AiError("BAD_CONFIG", "Bilinmeyen sağlayıcı.");
  const key = cleanKey(input.apiKey);
  const baseUrl = await cleanBaseUrl(info, input.baseUrl);
  const model = cleanModel(input.model);

  const existing = await prisma.aiProviderConfig.findUnique({ where: { userId_provider: { userId, provider: info.id } } });
  if (!existing && info.needsKey && !key) throw new AiError("NO_KEY", `${info.label} için API anahtarı gerekli.`);

  if (existing) {
    await prisma.aiProviderConfig.update({
      where: { id: existing.id },
      data: { ...(key ? { apiKey: encrypt(key) } : {}), baseUrl, model },
    });
    return;
  }
  const last = await prisma.aiProviderConfig.aggregate({ where: { userId }, _max: { position: true } });
  await prisma.aiProviderConfig.create({
    data: { userId, provider: info.id, apiKey: key ? encrypt(key) : null, baseUrl, model, position: (last._max.position ?? -1) + 1 },
  });
}

/** Rewrites positions as 0..n-1 in the given order. */
async function renumber(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(orderedIds.map((id, i) => prisma.aiProviderConfig.update({ where: { id }, data: { position: i } })));
}

async function orderedRows(userId: string) {
  return prisma.aiProviderConfig.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, provider: true } });
}

export async function removeConfig(userId: string, provider: string): Promise<boolean> {
  const { count } = await prisma.aiProviderConfig.deleteMany({ where: { userId, provider } });
  if (!count) return false;
  await renumber((await orderedRows(userId)).map((r) => r.id));
  return true;
}

/** Makes `provider` the primary; the rest keep their order as backups. */
export async function makePrimary(userId: string, provider: string): Promise<boolean> {
  const rows = await orderedRows(userId);
  const target = rows.find((r) => r.provider === provider);
  if (!target) return false;
  await renumber([target.id, ...rows.filter((r) => r.id !== target.id).map((r) => r.id)]);
  return true;
}

export async function moveConfig(userId: string, provider: string, dir: "up" | "down"): Promise<boolean> {
  const rows = await orderedRows(userId);
  const i = rows.findIndex((r) => r.provider === provider);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return false;
  const ids = rows.map((r) => r.id);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await renumber(ids);
  return true;
}
