/**
 * Single source of truth for the product name. Change the name here (and the logo files in
 * /public) instead of hunting for strings; `suffix` handles the Turkish case endings.
 */
export const BRAND = {
  /** Display name used in titles, prose and alt text. */
  name: "Orvane",
  /** Lowercase wordmark as drawn in the logo. */
  wordmark: "orvane",
  tagline: "Tek içerik. Tüm platformlar.",
  /** Turkish case suffixes that agree with the name's last vowel ("Orvane'e giriş yap"). */
  dative: "e",
  genitive: "in",
} as const;

/** "Orvane'e", "Orvane'in" ... */
export const brandDative = `${BRAND.name}'${BRAND.dative}`;
export const brandGenitive = `${BRAND.name}'${BRAND.genitive}`;
