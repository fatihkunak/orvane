/**
 * LLM provider registry for AI post writing (bring your own key).
 *
 * Ported from the Gramiq backend and the Nichevo app (same ids and defaults), extended with a few more
 * OpenAI-compatible hosts. Pure TypeScript with no Node or React imports, so both the server and the
 * settings UI can use it.
 *
 * - Most providers speak the OpenAI `chat/completions` dialect; Anthropic has its own Messages API.
 * - Model ids go stale quickly: `defaultModel` is only a starting point taken from official docs. When it is
 *   undefined the user MUST pick a model (the settings page fetches the real list from the provider).
 * - Antigravity is deliberately absent: it accepts no API key and using its login from a third party
 *   violates Google's terms. Gemini models are reachable with an AI Studio key instead.
 */

export type ProviderKind = "openai" | "anthropic";
export type ProviderGroup = "free" | "paid" | "local" | "other";

export interface ProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  group: ProviderGroup;
  /** undefined → the user types the address (custom host, Alibaba workspace URL) */
  baseUrl?: string;
  /** undefined → the user must pick a model */
  defaultModel?: string;
  /** Page where the key is created */
  keyUrl?: string;
  /** New OpenAI models want `max_completion_tokens` instead of `max_tokens` */
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  /** Auth header. EVREN ignores `Authorization: Bearer` and needs `X-API-Key` (found the hard way in production). */
  auth: "bearer" | "x-api-key";
  /** Local servers (Ollama, LM Studio, llama.cpp) run without a key */
  needsKey: boolean;
  /**
   * Quota (429) backups: on Gemini's free tier the quota is counted PER MODEL, so another model on the same key keeps
   * working. Deliberately only where that holds (OpenRouter's free limit is shared by all free models, Groq/Mistral
   * limits are per organisation, NVIDIA credits are per account).
   */
  fallbackModels?: readonly string[];
  /** Short hint shown under the provider name in the settings UI */
  note?: string;
  /**
   * Image generation models for the OpenAI-compatible `POST <baseUrl>/images/generations` (Gemini, OpenAI and Together all
   * speak it). Like the chat ids these go stale, so the user may type their own in settings. Missing/empty = cannot draw.
   */
  imageModels?: readonly string[];
  /** Shown under the image-model field in settings */
  imageNote?: string;
}

export const GROUP_LABELS: Record<ProviderGroup, string> = {
  free: "Ücretsiz katmanı olanlar",
  paid: "Ücretli",
  local: "Yerel sunucular (anahtarsız)",
  other: "Diğer",
};

export const GROUP_ORDER: ProviderGroup[] = ["free", "paid", "local", "other"];

type Extra = Partial<Pick<ProviderInfo, "maxTokensParam" | "auth" | "fallbackModels" | "note" | "needsKey" | "imageModels" | "imageNote">>;

const p = (
  id: string,
  label: string,
  kind: ProviderKind,
  group: ProviderGroup,
  baseUrl: string | undefined,
  defaultModel: string | undefined,
  keyUrl: string | undefined,
  extra: Extra = {},
): ProviderInfo => ({
  id,
  label,
  kind,
  group,
  baseUrl,
  defaultModel,
  keyUrl,
  maxTokensParam: "max_tokens",
  auth: "bearer",
  needsKey: group !== "local",
  ...extra,
});

export const PROVIDERS: readonly ProviderInfo[] = [
  // Free tier
  p("gemini", "Google Gemini", "openai", "free", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.8-flash", "https://aistudio.google.com/apikey", {
    fallbackModels: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"],
    note: "Ücretsiz kota model başınadır",
    // Gemini's OpenAI compatibility layer exposes image generation at /images/generations
    imageModels: ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"],
  }),
  p("groq", "Groq", "openai", "free", "https://api.groq.com/openai/v1", "qwen/qwen3.8-27b", "https://console.groq.com/keys"),
  p("openrouter", "OpenRouter", "openai", "free", "https://openrouter.ai/api/v1", "openrouter/free", "https://openrouter.ai/keys", {
    note: "Yüzlerce model tek anahtarla",
  }),
  p("nvidia", "NVIDIA NIM", "openai", "free", "https://integrate.api.nvidia.com/v1", undefined, "https://build.nvidia.com"),
  p("mistral", "Mistral", "openai", "free", "https://api.mistral.ai/v1", "mistral-small-latest", "https://console.mistral.ai/api-keys"),
  p("cerebras", "Cerebras", "openai", "free", "https://api.cerebras.ai/v1", undefined, "https://cloud.cerebras.ai"),
  // Paid
  p("anthropic", "Anthropic Claude", "anthropic", "paid", "https://api.anthropic.com/v1", "claude-haiku-5-5", "https://console.anthropic.com/settings/keys"),
  p("openai", "OpenAI", "openai", "paid", "https://api.openai.com/v1", "gpt-6-luna", "https://platform.openai.com/api-keys", {
    maxTokensParam: "max_completion_tokens",
    imageModels: ["gpt-image-1"],
  }),
  p("kimi", "Kimi (Moonshot)", "openai", "paid", "https://api.moonshot.ai/v1", "kimi-k2.6", "https://platform.moonshot.ai/console/api-keys"),
  p("xai", "xAI Grok", "openai", "paid", "https://api.x.ai/v1", undefined, "https://console.x.ai"),
  p("deepseek", "DeepSeek", "openai", "paid", "https://api.deepseek.com/v1", "deepseek-chat", "https://platform.deepseek.com/api_keys"),
  p("together", "Together AI", "openai", "paid", "https://api.together.xyz/v1", undefined, "https://api.together.ai/settings/api-keys", {
    imageModels: ["black-forest-labs/FLUX.1-schnell"],
  }),
  p("fireworks", "Fireworks AI", "openai", "paid", "https://api.fireworks.ai/inference/v1", undefined, "https://app.fireworks.ai/settings/users/api-keys"),
  // Local servers on the machine that runs Orvane. Blocked unless ALLOW_PRIVATE_LLM_URLS=1 (SSRF guard).
  p("ollama", "Ollama", "openai", "local", "http://localhost:11434/v1", undefined, "https://ollama.com/download", {
    note: "ALLOW_PRIVATE_LLM_URLS=1 gerekir",
  }),
  p("lmstudio", "LM Studio", "openai", "local", "http://localhost:1234/v1", undefined, "https://lmstudio.ai", {
    note: "ALLOW_PRIVATE_LLM_URLS=1 gerekir",
  }),
  p("llamacpp", "llama.cpp (llama-server)", "openai", "local", "http://localhost:8080/v1", undefined, "https://github.com/ggml-org/llama.cpp", {
    note: "ALLOW_PRIVATE_LLM_URLS=1 gerekir",
  }),
  // Other
  p("evren", "EVREN LLM", "openai", "other", "https://evren-llmapi.ssyz.org.tr/v1", undefined, "https://evren.ssyz.org.tr/llm-inference/", {
    auth: "x-api-key",
    imageNote: "Henüz görsel modeli yok; yayınlandığında model adını buraya yaz",
  }),
  // The endpoint is specific to the WORKSPACE (https://ws-<id>.<region>.maas.aliyuncs.com/compatible-mode/v1): the user types it
  p("alibaba", "Alibaba Qwen (Model Studio)", "openai", "other", undefined, undefined, "https://modelstudio.console.alibabacloud.com/", {
    note: "Adres çalışma alanına özeldir",
  }),
  p("custom", "OpenAI uyumlu (özel adres)", "openai", "other", undefined, undefined, undefined, {
    needsKey: false,
    note: "OmniRoute, vLLM, kendi sunucun…",
  }),
];

export const getProvider = (id: string): ProviderInfo | undefined => PROVIDERS.find((x) => x.id === id);

/** Can the user type or change the address for this provider? */
export const baseUrlEditable = (info: ProviderInfo): boolean => !info.baseUrl || info.group === "local";

/** The API address to call: the fixed one, or the user's override where the provider allows it. */
export function resolveBaseUrl(info: ProviderInfo, override?: string | null): string {
  const typed = (override ?? "").trim().replace(/\/+$/, "");
  if (info.baseUrl && !(info.group === "local" && typed)) return info.baseUrl;
  return typed;
}

/** Authentication headers for a provider and key. Keyless local servers send none. */
export function authHeaders(info: ProviderInfo, apiKey: string): Record<string, string> {
  if (!apiKey) return {};
  if (info.kind === "anthropic") return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  return info.auth === "x-api-key" ? { "x-api-key": apiKey } : { authorization: `Bearer ${apiKey}` };
}

/** Printable ASCII, no whitespace or control characters. */
export const API_KEY_RE = /^[\x21-\x7e]{8,512}$/;
