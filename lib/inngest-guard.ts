const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const devFlagOn = (value: string | undefined) =>
  value !== undefined && !["", "0", "false"].includes(value.trim().toLowerCase());

/**
 * In dev mode (INNGEST_DEV, or no signing key) the Inngest SDK runs every request unsigned, including
 * forged step results. Then only the local Dev Server may reach /api/inngest: a loopback Host and no
 * Cloudflare tunnel headers (cloudflared connects from localhost, so the socket alone can't tell them apart).
 */
export function inngestRequestAllowed(headers: Headers, env: Record<string, string | undefined> = process.env): boolean {
  if (env.INNGEST_SIGNING_KEY && !devFlagOn(env.INNGEST_DEV)) return true;
  if (headers.has("cf-connecting-ip") || headers.has("cf-ray")) return false;
  const host = (headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(host);
}
