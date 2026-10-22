/**
 * Image generation limits and ratios. Deliberately dependency-free: the post form (a client component) imports this, while
 * `lib/ai/image.ts` pulls in the provider client and with it Node-only SSRF code.
 */

export const MAX_IMAGE_PROMPT_CHARS = 1000;
export const IMAGE_TIMEOUT_MS = 120_000;

/** Aspect ratios offered in the form. Providers round to their nearest supported size. */
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export const IMAGE_SIZE_LABELS: Record<ImageSize, string> = {
  "1024x1024": "Kare (1:1)",
  "1536x1024": "Yatay (3:2)",
  "1024x1536": "Dikey (2:3)",
};
