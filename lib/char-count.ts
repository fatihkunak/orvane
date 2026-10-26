import type { Platform } from "@/generated/prisma/enums";
import { PLATFORMS } from "@/lib/platforms";

const EMOJI = /\p{Extended_Pictographic}/u;
const encoder = new TextEncoder();
/** URLs as X's t.co wrapping sees them: with a scheme, up to the next whitespace; trailing punctuation is not part of them. */
const URL_RE = /https?:\/\/[^\s]+/giu;
const TRAILING_PUNCT = /[.,;:!?)\]}'"”’»]+$/u;
const X_URL_LENGTH = 23;

/** twitter-text weighting: these ranges count 1, everything else (CJK, emoji, ...) counts 2. */
function xCodePointWeight(cp: number): number {
  return (cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247) ? 1 : 2;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function xTextWeight(text: string): number {
  let total = 0;
  const graphemes = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
  for (const g of graphemes) {
    if (EMOJI.test(g)) {
      total += 2; // a whole emoji sequence (ZWJ, skin tone, flag) is one weight-2 unit
      continue;
    }
    for (const ch of g) total += xCodePointWeight(ch.codePointAt(0)!);
  }
  return total;
}

/** X: every URL counts 23 whatever its length, the rest is weighted per character. */
function countX(text: string): number {
  let total = 0;
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING_PUNCT, "");
    total += xTextWeight(text.slice(last, m.index)) + X_URL_LENGTH;
    last = m.index + url.length;
  }
  return total + xTextWeight(text.slice(last));
}

/**
 * Length of `text` as the platform counts it.
 * - X: URLs count 23, emoji sequences and CJK count 2 (twitter-text weights), everything else 1.
 * - Threads counts emoji by their UTF-8 byte length (per the Threads docs).
 * - LinkedIn: one per Unicode code point.
 */
export function countChars(platform: Platform, text: string): number {
  if (platform === "TWITTER") return countX(text);
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
