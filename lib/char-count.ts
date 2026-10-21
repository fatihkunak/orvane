import type { Platform } from "@/generated/prisma/enums";
import { PLATFORMS } from "@/lib/platforms";

const EMOJI = /\p{Extended_Pictographic}/u;
const encoder = new TextEncoder();

/**
 * Length of `text` as the platform counts it.
 * - Threads counts emoji by their UTF-8 byte length (per the Threads docs).
 * - X and LinkedIn: one per Unicode code point. X counts every URL as 23 characters and
 *   weights some CJK characters double; that nuance is not modelled, so X is a close estimate.
 */
export function countChars(platform: Platform, text: string): number {
  let total = 0;
  for (const ch of text) {
    total += platform === "THREADS" && EMOJI.test(ch) ? encoder.encode(ch).length : 1;
  }
  return total;
}

/** Platforms whose limit `text` exceeds. */
export function overLimit(platforms: Platform[], text: string): Platform[] {
  return platforms.filter((p) => countChars(p, text) > PLATFORMS[p].charLimit);
}
