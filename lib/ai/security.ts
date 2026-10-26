import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AiError } from "@/lib/ai/errors";

/**
 * Letting the server call an address the user typed is SSRF (internal network, cloud metadata). Only https and public IPs
 * pass. `ALLOW_PRIVATE_LLM_URLS=1` is for local development with Ollama, LM Studio or llama.cpp ONLY: anyone who can sign in
 * to the app could aim the server at your local services while it is on, so leave it off on anything reachable from outside.
 * Note: DNS rebinding is not fully closed by this check.
 */
export const allowPrivateUrls = () => process.env.ALLOW_PRIVATE_LLM_URLS === "1";

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return (
      l === "::1" ||
      l === "::" ||
      /^fe[89abcdef]/.test(l) || // link-local fe80::/10 and deprecated site-local fec0::/10
      l.startsWith("fc") ||
      l.startsWith("fd") ||
      l.startsWith("::ffff:") ||
      l.startsWith("64:ff9b:") // NAT64 can embed any IPv4 address, internal ones included
    );
  }
  const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0) || a >= 224;
}

export async function assertSafeBaseUrl(raw: string, allowPrivate = allowPrivateUrls()): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AiError("BAD_CONFIG", "Adres geçerli bir URL değil (https://… olmalı).");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new AiError("BAD_CONFIG", "Adres http veya https olmalı.");
  if (u.username || u.password) throw new AiError("BAD_CONFIG", "Adres içinde kullanıcı/parola olamaz.");
  if (allowPrivate) return;
  if (u.protocol !== "https:") throw new AiError("BAD_CONFIG", "Adres https olmalı (http yalnızca yerel geliştirmede, ALLOW_PRIVATE_LLM_URLS=1 ile).");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new AiError("BAD_CONFIG", "Bu adres izinli değil (yerel/iç ağ). Yerel sunucular için ALLOW_PRIVATE_LLM_URLS=1 gerekir.");
  }
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new AiError("BAD_CONFIG", "Adres çözümlenemedi.");
  if (addrs.some(isPrivateIp)) throw new AiError("BAD_CONFIG", "Bu adres izinli değil (iç ağa çözümleniyor).");
}

/** Provider error bodies can echo the key back; never show it. */
export function redact(text: string, key: string): string {
  const cleaned = key.length >= 8 ? text.split(key).join("***") : text;
  return cleaned.slice(0, 300);
}
