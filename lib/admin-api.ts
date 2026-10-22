import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { takeToken } from "@/lib/ai/rate-limit";

/**
 * Service-to-service guard for /api/admin/*. The fatihgo admin panel (Cloudflare Pages Function) calls these routes with
 * `Authorization: Bearer <ORVANE_ADMIN_TOKEN>`. This is NOT a user session: the token is a shared secret held only by the
 * panel's server side, never by a browser. Unset or short → the admin API is off (503), so it cannot be open by accident.
 */
export const MIN_ADMIN_TOKEN_LENGTH = 32;
const FAILURES = { count: 10, windowMs: 10 * 60_000 };

const sha = (s: string) => createHash("sha256").update(s).digest();

const json = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers });

/** null = allowed; otherwise the response to send. Only failed attempts count against the per-client limit. */
export function adminGuard(req: Request, env: NodeJS.ProcessEnv = process.env): Response | null {
  const secret = env.ORVANE_ADMIN_TOKEN ?? "";
  if (secret.length < MIN_ADMIN_TOKEN_LENGTH) return json(503, "Admin API is not configured");

  const client = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const header = req.headers.get("authorization") ?? "";
  const presented = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  // Compare fixed-length digests in constant time (no early exit on length or first differing byte)
  if (presented && timingSafeEqual(sha(presented), sha(secret))) return null;

  const t = takeToken(`admin-fail:${client}`, FAILURES.count, FAILURES.windowMs);
  if (!t.ok) return json(429, "Too many failed attempts", { "Retry-After": String(t.retryAfterSec) });
  return json(401, "Unauthorized", { "WWW-Authenticate": "Bearer" });
}
