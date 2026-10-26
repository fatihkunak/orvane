/**
 * Small in-memory sliding-window limiter per key. It protects the user's own provider quota (and wallet) from runaway
 * clicking or a loop, and counts failed admin attempts. It lives in one Node process; that is enough for this single-instance
 * app (with several instances each would keep its own counters, so the limits would multiply).
 *
 * Keys can be attacker-chosen (e.g. a spoofed client address), so the map must not grow without bound: stale keys are swept
 * and the number of keys has a hard cap.
 */
interface Entry {
  times: number[];
  windowMs: number;
}
const hits = new Map<string, Entry>();

const SWEEP_EVERY = 500; // calls between sweeps
const MAX_KEYS = 20_000;
let calls = 0;

function sweep(now: number): void {
  for (const [k, e] of hits) {
    const last = e.times[e.times.length - 1];
    if (last === undefined || now - last >= e.windowMs) hits.delete(k);
  }
  // Still over the cap with live keys: drop the oldest-inserted ones (Map keeps insertion order)
  for (const k of hits.keys()) {
    if (hits.size <= MAX_KEYS * 0.9) break; // leave headroom so the next calls do not sweep again
    hits.delete(k);
  }
}

export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  if (++calls % SWEEP_EVERY === 0 || hits.size >= MAX_KEYS) sweep(now);

  const recent = (hits.get(key)?.times ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, { times: recent, windowMs });
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, { times: recent, windowMs });
  return { ok: true };
}

/** For tests */
export function resetRateLimits(): void {
  hits.clear();
  calls = 0;
}

/** For tests */
export function rateLimitKeyCount(): number {
  return hits.size;
}
