import { AiError, canFailover, type AiErrorCode } from "@/lib/ai/errors";

export interface Attempt {
  provider: string;
  ok: boolean;
  code?: AiErrorCode;
  message?: string;
}

/** Every provider in the chain failed. Carries the FIRST error's code (the main provider's reason) plus the full trail. */
export class ChainError extends AiError {
  constructor(first: AiError, readonly tried: Attempt[]) {
    super(first.code, tried.length > 1 ? `${first.message} · ${tried.length} sağlayıcı denendi` : first.message, first.retryAfterSec);
    this.name = "ChainError";
  }
}

/**
 * Tries each entry in order. An error specific to one provider (key, quota, payment, outage, bad output, bad config) moves on
 * to the next one; any other error (a problem with the request itself) is thrown straight away. When all entries fail, the FIRST
 * error is reported so the user sees why their main provider failed, together with the trail of attempts.
 */
export async function runChain<E, T>(
  entries: readonly E[],
  idOf: (e: E) => string,
  attempt: (e: E) => Promise<T>,
): Promise<{ value: T; entry: E; tried: Attempt[] }> {
  const tried: Attempt[] = [];
  let first: AiError | null = null;
  for (const entry of entries) {
    try {
      const value = await attempt(entry);
      tried.push({ provider: idOf(entry), ok: true });
      return { value, entry, tried };
    } catch (e) {
      if (!canFailover(e)) throw e;
      const err = e as AiError;
      tried.push({ provider: idOf(entry), ok: false, code: err.code, message: err.message });
      first ??= err;
    }
  }
  if (!first) throw new AiError("NO_PROVIDER", "Yapılandırılmış yapay zekâ sağlayıcısı yok.");
  throw new ChainError(first, tried);
}

/** A 429 asking for at most this many seconds is waited out once on the same model; longer → next model. */
export const SHORT_RETRY_SEC = 8;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Quota backups inside ONE provider (Gemini counts its free quota per model): on a rate limit, wait if the provider asks for a
 * short pause, otherwise switch to the next model. Other errors are thrown as they are, except that if an earlier model hit the
 * quota, THAT quota message is what the user should see.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  call: (model: string) => Promise<T>,
  sleep: (ms: number) => Promise<void> = delay,
): Promise<{ value: T; model: string }> {
  let firstQuota: AiError | null = null;
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { value: await call(model), model };
      } catch (e) {
        last = e;
        if (!(e instanceof AiError) || e.code !== "RATE_LIMIT") throw firstQuota ?? e;
        firstQuota ??= e;
        if (attempt === 0 && e.retryAfterSec != null && e.retryAfterSec <= SHORT_RETRY_SEC) {
          await sleep(e.retryAfterSec * 1000);
          continue;
        }
        break; // next model
      }
    }
  }
  throw last;
}
