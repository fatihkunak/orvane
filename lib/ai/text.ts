/** Removes `<think>…</think>` blocks (also an unclosed one left by a truncated answer). Pure, safe for the browser. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<think(?:ing)?>[\s\S]*$/i, "")
    .trim();
}
