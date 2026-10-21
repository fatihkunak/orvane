/**
 * Error codes of the AI layer. They decide whether the next provider in the chain is tried:
 * everything specific to ONE provider (key, quota, outage, bad output, payment, bad config) fails over,
 * while a problem with the request itself does not (another provider would reject it too).
 */
export type AiErrorCode =
  | "BAD_CONFIG" // missing/invalid address, model, provider
  | "NO_KEY"
  | "AUTH" // 401/403
  | "PAYMENT" // 402: credits depleted
  | "RATE_LIMIT" // 429
  | "PROVIDER" // 5xx, network, timeout
  | "BAD_OUTPUT" // empty or unparsable answer
  | "BAD_REQUEST" // 400/422 about the prompt itself
  | "NO_PROVIDER"; // nothing configured

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    /** Seconds the provider asked us to wait (429 `retry-after`) */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const FAILOVER: ReadonlySet<AiErrorCode> = new Set(["BAD_CONFIG", "NO_KEY", "AUTH", "PAYMENT", "RATE_LIMIT", "PROVIDER", "BAD_OUTPUT"]);

/** Is trying the NEXT provider worthwhile after this error? */
export const canFailover = (e: unknown): boolean => e instanceof AiError && FAILOVER.has(e.code);
