import { AiError } from "@/lib/ai/errors";
import { authHeaders, type ProviderInfo, type ProviderKind } from "@/lib/ai/providers";
import { redact } from "@/lib/ai/security";
import { stripThinking } from "@/lib/ai/text";

export { stripThinking };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Everything needed for one call: the provider, the (decrypted) key, the resolved address and the model. */
export interface Creds {
  info: ProviderInfo;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** One provider call may take this long; a hanging provider must not freeze the whole chain. */
export const REQUEST_TIMEOUT_MS = 60_000;
const timed: FetchLike = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

/** "Thinking" models spend the token budget on reasoning first; a small limit returns an empty answer. */
export const DEFAULT_MAX_TOKENS = 4096;
const CHECK_TOKENS = 256;

export const chatUrl = (c: Creds) => `${c.baseUrl}${c.info.kind === "anthropic" ? "/messages" : "/chat/completions"}`;

export function requestBody(c: Creds, system: string, user: string, maxTokens = DEFAULT_MAX_TOKENS): Record<string, unknown> {
  if (c.info.kind === "anthropic") {
    return { model: c.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
  }
  return {
    model: c.model,
    [c.info.maxTokensParam]: maxTokens,
    stream: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function parseResponse(kind: ProviderKind, v: unknown): string {
  const body = v as {
    content?: Array<{ type?: string; text?: string }>;
    stop_reason?: string;
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  };
  let text: unknown;
  let finish: string | undefined;
  if (kind === "anthropic") {
    text = body?.content?.filter((b) => b.type === undefined || b.type === "text").map((b) => b.text ?? "").join("");
    finish = body?.stop_reason;
  } else {
    const content = body?.choices?.[0]?.message?.content;
    // Some servers return an array of parts instead of a string
    text = Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? ""))).join("") : content;
    finish = body?.choices?.[0]?.finish_reason;
  }
  const clean = typeof text === "string" ? stripThinking(text) : "";
  if (!clean) {
    if (finish === "length" || finish === "max_tokens") {
      throw new AiError("BAD_OUTPUT", "Yanıt token sınırına takıldı (model önce düşünüyor olabilir). Başka bir model dene.");
    }
    throw new AiError("BAD_OUTPUT", "Sağlayıcı boş yanıt döndürdü.");
  }
  return clean;
}

/** `GET /models` bodies: {data:[{id}]}, {models:[{name:"models/x"}]}, {models:[{id}]} */
export function parseModelList(v: unknown): string[] {
  const body = v as { data?: unknown; models?: unknown };
  const arr = (Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []) as Array<{ id?: unknown; name?: unknown }>;
  const ids = arr
    .map((m) => (typeof m?.id === "string" ? m.id : typeof m?.name === "string" ? m.name : ""))
    .map((s) => (s.startsWith("models/") ? s.slice(7) : s))
    .filter((s) => s.length > 0 && s.length <= 200);
  return [...new Set(ids)].sort().slice(0, 300);
}

/** Message from `{error:{message}}`, `{error:"…"}`, `{message}` or the raw text. */
function errorMessage(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } | string; message?: string };
    const e = j?.error;
    return (typeof e === "string" ? e : e?.message) ?? j?.message ?? bodyText;
  } catch {
    return bodyText;
  }
}

/** Seconds the provider asked us to wait: `retry-after` header or Gemini's `"retryDelay": "12s"`. */
function retryAfterSec(headers: Headers, bodyText: string): number | undefined {
  const h = Number(headers.get("retry-after"));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(bodyText);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

export function classifyHttpError(status: number, bodyText: string, headers: Headers, apiKey: string): AiError {
  const msg = redact(errorMessage(bodyText), apiKey);
  const text = `${status}: ${msg}`;
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) return new AiError("AUTH", `Anahtar reddedildi (${text})`);
  if (status === 402) return new AiError("PAYMENT", `Kredi/ödeme gerekli (${text})`);
  if (status === 429) return new AiError("RATE_LIMIT", `Kota/hız sınırı (${text})`, retryAfterSec(headers, bodyText));
  // Gemini answers 400 (not 401) for a bad key
  if (status === 400 && (lower.includes("api_key_invalid") || lower.includes("api key not valid"))) return new AiError("AUTH", `Anahtar reddedildi (${text})`);
  if ((status === 400 || status === 404) && lower.includes("model") && /(not found|does not exist|unknown|not supported|decommission|deprecated)/.test(lower)) {
    return new AiError("BAD_CONFIG", `Model bulunamadı veya kullanılamıyor (${text})`);
  }
  if (status === 404) return new AiError("BAD_CONFIG", `Adres veya model bulunamadı (${text})`);
  if (status === 400 || status === 422) return new AiError("BAD_REQUEST", `İstek reddedildi (${text})`);
  return new AiError("PROVIDER", `Sağlayıcı hatası (${text})`);
}

async function request(url: string, init: RequestInit, c: Creds, fetchImpl: FetchLike): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    const name = (e as Error)?.name;
    const msg = name === "TimeoutError" || name === "AbortError" ? "zaman aşımı" : (e as Error)?.message ?? "bağlantı hatası";
    throw new AiError("PROVIDER", `Sağlayıcıya ulaşılamadı: ${redact(msg, c.apiKey)}`);
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text, res.headers, c.apiKey);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("BAD_OUTPUT", `Beklenmeyen yanıt: ${redact(text, c.apiKey).slice(0, 120)}`);
  }
}

const jsonHeaders = (c: Creds) => ({ "content-type": "application/json", ...authHeaders(c.info, c.apiKey) });

/** One chat completion → plain text (thinking blocks removed). */
export async function complete(c: Creds, system: string, user: string, opts: { maxTokens?: number; fetchImpl?: FetchLike } = {}): Promise<string> {
  if (!c.model) throw new AiError("BAD_CONFIG", `${c.info.label} için bir model seçmelisin.`);
  const body = await request(
    chatUrl(c),
    { method: "POST", headers: jsonHeaders(c), body: JSON.stringify(requestBody(c, system, user, opts.maxTokens)) },
    c,
    opts.fetchImpl ?? timed,
  );
  return parseResponse(c.info.kind, body);
}

export async function listModels(c: Creds, fetchImpl: FetchLike = timed): Promise<string[]> {
  const url = `${c.baseUrl}/models${c.info.kind === "anthropic" ? "?limit=100" : ""}`;
  const body = await request(url, { method: "GET", headers: authHeaders(c.info, c.apiKey) }, c, fetchImpl);
  return parseModelList(body);
}

/** A tiny real request (key + model check). Returns the latency in ms; throws the classified error otherwise. */
export async function checkCreds(c: Creds, fetchImpl: FetchLike = timed): Promise<number> {
  const t0 = Date.now();
  await complete(c, "Reply with the single word OK.", "ping", { maxTokens: CHECK_TOKENS, fetchImpl });
  return Date.now() - t0;
}
