import "server-only";
import { generateImage, type ImageSize } from "@/lib/ai/image";
import { AiError } from "@/lib/ai/errors";
import { runChain, withModelFallback, type Attempt } from "@/lib/ai/failover";
import { credsFromEntry } from "@/lib/ai/service";
import { loadChain, type ChainEntry } from "@/lib/ai/store";
import type { FetchLike } from "@/lib/ai/client";
import { storeMediaBytes } from "@/lib/media-store";

/**
 * Image generation for one user, over their own provider chain. Mirrors `generateForUser`: the preferred provider goes first,
 * a provider that cannot draw is skipped (BAD_CONFIG fails over), and a backup takes over when the main one runs out of quota.
 * The bytes are stored through `storeMediaBytes`, so the result is a media URL the post form can attach and the publishers can
 * download -- never a link to the provider.
 */

export interface ImageInput {
  prompt: string;
  size?: ImageSize;
  /** Registry id the user picked; empty = chain order */
  providerId?: string;
}

export interface ImageResult {
  /** Stored media URL (`/api/media/<uuid>.png` or Cloudinary) */
  url: string;
  provider: string;
  providerLabel: string;
  model: string;
  ms: number;
  tried: Attempt[];
}

export interface Deps {
  /** Replaced in tests so no real network call is made */
  fetchImpl?: FetchLike;
}

/** The model ids to try for one provider: the user's own id wins, otherwise the registry list. Empty = cannot draw. */
export const imageModelsFor = (e: Pick<ChainEntry, "imageModel" | "info">): string[] =>
  e.imageModel ? [e.imageModel] : [...(e.info.imageModels ?? [])];

export function orderForImages(chain: readonly ChainEntry[], providerId?: string): ChainEntry[] {
  if (!providerId) return [...chain];
  const chosen = chain.filter((e) => e.provider === providerId);
  return [...chosen, ...chain.filter((e) => e.provider !== providerId)];
}

export async function generateImageForUser(userId: string, input: ImageInput, deps: Deps = {}): Promise<ImageResult> {
  const chain = orderForImages(await loadChain(userId), input.providerId);
  if (chain.length === 0) throw new AiError("NO_PROVIDER", "Yapılandırılmış yapay zekâ sağlayıcısı yok.");

  const t0 = Date.now();
  const run = await runChain(
    chain,
    (e) => e.provider,
    async (entry) => {
      const models = imageModelsFor(entry);
      if (models.length === 0) {
        throw new AiError("BAD_CONFIG", `${entry.info.label} görsel üretmiyor. Görsel destekleyen bir sağlayıcı ekle.`);
      }
      const creds = await credsFromEntry(entry);
      const { value, model } = await withModelFallback(models, (m) => generateImage({ ...creds, model: m }, input.prompt, { size: input.size, fetchImpl: deps.fetchImpl }));
      return { image: value, model };
    },
  );

  const { image, model } = run.value;
  const stored = await storeMediaBytes(image.bytes, image.mime); // throws → the caller reports it; nothing half-saved
  return {
    url: stored.url,
    provider: run.entry.provider,
    providerLabel: run.entry.info.label,
    model,
    ms: Date.now() - t0,
    tried: run.tried,
  };
}
