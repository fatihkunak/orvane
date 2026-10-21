/**
 * Small in-memory sliding-window limiter per user. It protects the user's own provider quota (and wallet) from runaway
 * clicking or a loop, not the server from attackers. It lives in one Node process; that is enough for this single-instance app.
 */
const hits = new Map<string, number[]>();

export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** For tests */
export function resetRateLimits(): void {
  hits.clear();
}
