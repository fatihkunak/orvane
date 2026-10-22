import "server-only";
import { checkCreds, complete, listModels, type Creds, type FetchLike } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { runChain, withModelFallback, type Attempt } from "@/lib/ai/failover";
import {
  buildPrompts,
  buildShortenPrompt,
  evaluate,
  generateInputSchema,
  parseVariants,
  type GenerateInput,
  type GenerateRequest,
  type Variant,
} from "@/lib/ai/prompt";
import type { Platform } from "@/generated/prisma/enums";
import { baseUrlEditable, getProvider, resolveBaseUrl } from "@/lib/ai/providers";
import { assertSafeBaseUrl } from "@/lib/ai/security";
import { cleanBaseUrl, cleanKey, cleanModel, loadChain, type ChainEntry } from "@/lib/ai/store";

export interface Deps {
  /** Replaced in tests so no real network call is made */
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/** Turns a stored provider entry into call credentials, with the SSRF check for user-chosen addresses. */
export async function credsFromEntry(e: ChainEntry): Promise<Creds> {
  if (e.keyBroken) throw new AiError("NO_KEY", `${e.info.label} anahtarı okunamadı, yeniden gir.`);
  if (e.info.needsKey && !e.apiKey) throw new AiError("NO_KEY", `${e.info.label} için API anahtarı yok.`);
  const baseUrl = resolveBaseUrl(e.info, e.baseUrl);
  if (!baseUrl) throw new AiError("BAD_CONFIG", `${e.info.label} için adres gerekli.`);
  if (baseUrlEditable(e.info)) await assertSafeBaseUrl(baseUrl);
  const model = e.model ?? e.info.defaultModel ?? "";
  return { info: e.info, apiKey: e.apiKey, baseUrl, model };
}

export interface GenerateResult {
  /** Shared mode: the drafts. Per-platform mode: all drafts in platform order (the UI reads `byPlatform`). */
  variants: Variant[];
  /** Only in per-platform mode: drafts written for each selected platform separately */
  byPlatform?: Partial<Record<Platform, Variant[]>>;
  /** Only in per-platform mode: who wrote each platform's drafts (a backup may have taken over midway) */
  writers?: Partial<Record<Platform, { providerLabel: string; model: string }>>;
  provider: string;
  providerLabel: string;
  model: string;
  ms: number;
  tried: Attempt[];
}

/**
 * Writes post drafts with the user's own providers. Chain: the preferred (or primary) provider first, the rest as backups; a
 * provider-specific error moves on to the next one. Texts that exceed a platform limit get ONE automatic shortening attempt.
 * With `perPlatform` (and 2+ platforms) every platform gets its own drafts written against its own limit and style. The
 * result is only ever a draft for the user to review.
 */
export async function generateForUser(userId: string, input: GenerateInput, deps: Deps = {}): Promise<GenerateResult> {
  const parsed = generateInputSchema.safeParse(input);
  if (!parsed.success) throw new AiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const req: GenerateRequest = parsed.data;

  let chain = await loadChain(userId);
  if (chain.length === 0) throw new AiError("NO_PROVIDER", "Önce Ayarlar → Yapay zekâ bölümünden bir sağlayıcı ekle.");
  if (req.providerId) {
    const i = chain.findIndex((c) => c.provider === req.providerId);
    if (i > 0) chain = [chain[i]!, ...chain.filter((_, k) => k !== i)];
  }

  const t0 = Date.now();
  if (!req.perPlatform || req.platforms.length < 2) {
    const one = await generateOne(chain, req, deps);
    return { variants: one.variants, provider: one.entry.provider, providerLabel: one.entry.info.label, model: one.model, ms: Date.now() - t0, tried: one.tried };
  }

  // One request per platform, one after the other. After the first success the provider that answered goes first, so a dead
  // main provider is not retried (and waited on) for every platform.
  const byPlatform: Partial<Record<Platform, Variant[]>> = {};
  const writers: NonNullable<GenerateResult["writers"]> = {};
  const tried: Attempt[] = [];
  let last!: Awaited<ReturnType<typeof generateOne>>;
  for (const platform of req.platforms) {
    last = await generateOne(chain, { ...req, platforms: [platform] }, deps);
    byPlatform[platform] = last.variants;
    writers[platform] = { providerLabel: last.entry.info.label, model: last.model };
    tried.push(...last.tried);
    chain = [last.entry, ...chain.filter((c) => c.provider !== last.entry.provider)];
  }
  return {
    variants: req.platforms.flatMap((p) => byPlatform[p] ?? []),
    byPlatform,
    writers,
    provider: last.entry.provider,
    providerLabel: last.entry.info.label,
    model: last.model,
    ms: Date.now() - t0,
    tried,
  };
}

/** One generation for exactly the platforms in `req` (a single platform in per-platform mode): chain → parse → shorten once. */
async function generateOne(chain: ChainEntry[], req: GenerateRequest, deps: Deps) {
  const { system, user } = buildPrompts(req);

  const { value, entry, tried } = await runChain(
    chain,
    (e) => e.provider,
    async (e) => {
      const base = await credsFromEntry(e);
      const models = [base.model, ...(e.info.fallbackModels ?? []).filter((m) => m !== base.model)].filter(Boolean);
      if (models.length === 0) throw new AiError("BAD_CONFIG", `${e.info.label} için bir model seçmelisin.`);
      const r = await withModelFallback(
        models,
        async (model) => {
          const raw = await complete({ ...base, model }, system, user, { fetchImpl: deps.fetchImpl });
          const texts = parseVariants(raw, req.count);
          if (texts.length === 0) throw new AiError("BAD_OUTPUT", "Yanıt beklenen biçimde değil (JSON varyasyon listesi).");
          return texts;
        },
        deps.sleep,
      );
      return { texts: r.value, model: r.model, creds: { ...base, model: r.model } };
    },
  );

  // Over the limit: one shortening attempt per variant on the same provider and model; keep the original (flagged) if it fails
  const repaired: Variant[] = [];
  for (const v of evaluate(value.texts, req.platforms)) {
    if (v.over.length === 0) {
      repaired.push(v);
      continue;
    }
    try {
      const p = buildShortenPrompt(v.text, req.platforms);
      const short = parseVariants(await complete(value.creds, p.system, p.user, { fetchImpl: deps.fetchImpl }), 1)[0];
      const next = short ? evaluate([short], req.platforms)[0]! : v;
      repaired.push(next.over.length < v.over.length || (short && next.text.length < v.text.length && next.over.length === 0) ? next : v);
    } catch {
      repaired.push(v);
    }
  }

  return { variants: repaired, entry, model: value.model, tried };
}

/** What the settings page sends to test a provider or fetch its models: typed values, falling back to the stored ones. */
export interface ProbeInput {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

async function probeCreds(userId: string, input: ProbeInput): Promise<Creds> {
  const info = getProvider(input.provider);
  if (!info) throw new AiError("BAD_CONFIG", "Bilinmeyen sağlayıcı.");
  const stored = (await loadChain(userId)).find((c) => c.provider === info.id);
  const typedKey = cleanKey(input.apiKey);
  const apiKey = typedKey ?? stored?.apiKey ?? "";
  if (info.needsKey && !apiKey) throw new AiError("NO_KEY", `${info.label} için API anahtarı gerekli.`);
  // An address that was not sent falls back to the stored one (custom/alibaba need one); local servers default to theirs
  const typedUrl = await cleanBaseUrl(info, input.baseUrl ?? stored?.baseUrl ?? undefined);
  const baseUrl = resolveBaseUrl(info, typedUrl);
  if (!baseUrl) throw new AiError("BAD_CONFIG", `${info.label} için adres gerekli.`);
  const model = cleanModel(input.model) ?? stored?.model ?? info.defaultModel ?? "";
  return { info, apiKey, baseUrl, model };
}

export async function fetchModelsForUser(userId: string, input: ProbeInput, deps: Deps = {}): Promise<string[]> {
  return listModels(await probeCreds(userId, input), deps.fetchImpl);
}

export async function checkProviderForUser(userId: string, input: ProbeInput, deps: Deps = {}): Promise<number> {
  return checkCreds(await probeCreds(userId, input), deps.fetchImpl);
}
