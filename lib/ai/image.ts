import { classifyHttpError, type Creds, type FetchLike } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { authHeaders } from "@/lib/ai/providers";
import { redact } from "@/lib/ai/security";
import { ALLOWED_MEDIA_TYPES, MAX_IMAGE_BYTES } from "@/lib/media";
import { IMAGE_SIZES, IMAGE_TIMEOUT_MS, MAX_IMAGE_PROMPT_CHARS, type ImageSize } from "@/lib/ai/image-meta";

export { IMAGE_SIZES, IMAGE_TIMEOUT_MS, MAX_IMAGE_PROMPT_CHARS, type ImageSize };

/**
 * Image generation over the OpenAI-compatible `POST <baseUrl>/images/generations`.
 *
 * Gemini exposes exactly this shape under its compatibility layer, OpenAI serves it natively, and EVREN will sit on the same
 * dialect once it ships an image model -- so one adapter covers all three. Only `b64_json` answers are accepted: a provider
 * that returns a URL would make the server download an arbitrary address, which is the SSRF hole `lib/media.ts` closes for
 * post media. A provider that cannot answer in base64 is simply unsupported.
 */

export interface GeneratedImage {
  bytes: Buffer;
  /** Detected from the bytes, never from what the provider claims */
  mime: string;
  model: string;
}

export const imagesUrl = (c: Creds) => `${c.baseUrl}/images/generations`;

export function imageRequestBody(model: string, prompt: string, size: ImageSize = "1024x1024"): Record<string, unknown> {
  return { model, prompt, n: 1, size, response_format: "b64_json" };
}

/**
 * PNG, JPEG, GIF or WebP from the magic bytes. Anything else is refused: the upload route only accepts the first three, so
 * an unexpected format must fail here rather than reach a publisher.
 */
export function sniffImageMime(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** `{data:[{b64_json}]}` → bytes. Gemini and OpenAI both answer this way. */
export function parseImageResponse(v: unknown, model = "", maxBytes = MAX_IMAGE_BYTES): GeneratedImage {
  const item = (v as { data?: Array<{ b64_json?: unknown; url?: unknown }> })?.data?.[0];
  if (!item) throw new AiError("BAD_OUTPUT", "Sağlayıcı görsel döndürmedi.");
  if (typeof item.b64_json !== "string" || !item.b64_json) {
    if (typeof item.url === "string" && item.url) {
      throw new AiError("BAD_OUTPUT", "Sağlayıcı görseli adres (url) olarak döndürdü; bu uygulama yalnızca base64 kabul eder.");
    }
    throw new AiError("BAD_OUTPUT", "Sağlayıcı görsel döndürmedi.");
  }
  const bytes = Buffer.from(item.b64_json, "base64");
  if (bytes.length === 0) throw new AiError("BAD_OUTPUT", "Görsel verisi boş geldi.");
  if (bytes.length > maxBytes) {
    throw new AiError("BAD_OUTPUT", `Görsel çok büyük (${Math.round(bytes.length / 1024 / 1024)} MB, en fazla ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }
  const mime = sniffImageMime(bytes);
  if (!mime) throw new AiError("BAD_OUTPUT", "Gelen veri tanıdık bir görsel biçimi değil (PNG/JPEG/GIF/WebP).");
  // WebP is detected but not accepted: the upload pipeline and the publishers only handle the types in ALLOWED_MEDIA_TYPES
  if (!ALLOWED_MEDIA_TYPES[mime]) {
    throw new AiError("BAD_OUTPUT", `Sağlayıcı ${mime.replace("image/", "").toUpperCase()} döndürdü; yalnızca PNG/JPEG/GIF destekleniyor.`);
  }
  return { bytes, mime, model };
}

/** One image. Throws a classified AiError so the chain can fail over to the next provider. */
export async function generateImage(
  c: Creds,
  prompt: string,
  opts: { size?: ImageSize; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<GeneratedImage> {
  if (!c.model) throw new AiError("BAD_CONFIG", `${c.info.label} için bir görsel modeli seçmelisin.`);
  const p = prompt.trim();
  if (!p) throw new AiError("BAD_REQUEST", "Görsel istemi boş olamaz.");
  if (p.length > MAX_IMAGE_PROMPT_CHARS) throw new AiError("BAD_REQUEST", `Görsel istemi en fazla ${MAX_IMAGE_PROMPT_CHARS} karakter olabilir.`);

  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? IMAGE_TIMEOUT_MS) }));
  let res: Response;
  try {
    res = await fetchImpl(imagesUrl(c), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(c.info, c.apiKey) },
      body: JSON.stringify(imageRequestBody(c.model, p, opts.size)),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AiError("PROVIDER", `${c.info.label} görseli zamanında üretmedi (zaman aşımı). Tekrar dene ya da başka bir model seç.`);
    }
    throw new AiError("PROVIDER", `Sağlayıcıya ulaşılamadı: ${redact((e as Error)?.message ?? "bağlantı hatası", c.apiKey)}`);
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text, res.headers, c.apiKey);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AiError("BAD_OUTPUT", `Beklenmeyen yanıt: ${redact(text, c.apiKey).slice(0, 120)}`);
  }
  return parseImageResponse(body, c.model);
}
