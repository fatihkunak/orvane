import { absoluteMediaUrl, isAllowedMediaUrl, mediaKind, type MediaKind } from "@/lib/media";

export type PublishInput = { text: string; mediaUrls: string[] };
export type PublishContext = { accessToken: string; platformUserId: string };
export type PublishResult = { publishedPostId: string };

/** Injected so tests can run the full request sequence without network or real waiting. */
export type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

export const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * `retryable` tells the job runner whether another attempt can succeed
 * (network blips, 429, 5xx) or whether the user has to act (bad token, rejected content).
 */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export async function failFromResponse(res: Response, label: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 400);
  const retryable = res.status === 429 || res.status >= 500;
  throw new PublishError(`${label}: ${res.status} ${body}`.trim(), retryable, res.status);
}

export type MediaFile = { bytes: Uint8Array; contentType: string; kind: MediaKind; url: string };

/** Downloads a stored media URL so it can be re-uploaded to the platform. */
export async function downloadMedia(url: string, deps: Deps): Promise<MediaFile> {
  // Defence in depth: the post schema already enforces this, but rows may predate a rule change
  if (!isAllowedMediaUrl(url)) throw new PublishError(`Geçersiz medya adresi: ${url}`, false);
  // Never follow redirects: an allowed URL must not be able to bounce this server to an internal address
  const res = await deps.fetch(absoluteMediaUrl(url), { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new PublishError(`Medya adresi yönlendirme döndürdü (${res.status}): ${url}`, false);
  if (!res.ok) throw new PublishError(`Medya indirilemedi (${res.status}): ${url}`, res.status >= 500);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const header = res.headers.get("content-type")?.split(";")[0];
  const kind = mediaKind(url);
  const contentType = header && header !== "application/octet-stream" ? header : kind === "video" ? "video/mp4" : "image/jpeg";
  return { bytes, contentType, kind, url };
}

export function splitMedia(urls: string[]) {
  const kinds = urls.map(mediaKind);
  return { images: urls.filter((_, i) => kinds[i] === "image"), videos: urls.filter((_, i) => kinds[i] === "video") };
}
