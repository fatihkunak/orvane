import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/ai/rate-limit";

/**
 * Unauthenticated floods must not turn into database queries: junk tokens are refused by their shape alone, and a client that
 * keeps failing is stopped BEFORE the lookup. Valid tokens from other clients are not affected.
 */

const tokens = vi.hoisted(() => ({ verify: vi.fn<(token: string) => Promise<{ userId: string; tokenId: string } | null>>(async () => null) }));
vi.mock("@/lib/api-tokens", async (orig) => ({ ...(await orig<typeof import("@/lib/api-tokens")>()), verifyApiToken: tokens.verify }));
import { POST as mcpPost } from "@/app/api/mcp/route";

const wellFormed = (n: number) => `orv_${String(n).padStart(43, "a")}`; // right shape, unknown token
const VALID = `orv_${"v".repeat(43)}`;

const rpc = (headers: Record<string, string>) =>
  new Request("http://localhost:3055/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
  });
const from = (client: string, token: string) => rpc({ "cf-connecting-ip": client, authorization: `Bearer ${token}` });

beforeEach(() => {
  resetRateLimits();
  tokens.verify.mockReset();
  tokens.verify.mockImplementation(async (t) => (t === VALID ? { userId: "u1", tokenId: "t1" } : null));
});

describe("MCP endpoint under unauthenticated load", () => {
  it("never queries for tokens that cannot be real ones", async () => {
    for (const bad of ["", "orv_nope", "x".repeat(300), `orv_${"a".repeat(42)}`, `orv_${"a".repeat(44)}`, `orv_${"a".repeat(42)}!`, "Bearer"]) {
      expect((await mcpPost(from("198.51.100.1", bad))).status).toBe(401);
    }
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it("stops a client that keeps failing before it reaches the database", async () => {
    let blockedAt = -1;
    for (let i = 0; i < 60; i++) {
      const res = await mcpPost(from("198.51.100.2", wellFormed(i)));
      if (res.status === 429 && blockedAt < 0) blockedAt = i;
    }
    expect(blockedAt).toBeGreaterThan(0);
    // Lookups stop at the moment the client is blocked: later attempts cost nothing
    expect(tokens.verify).toHaveBeenCalledTimes(blockedAt);
  });

  it("does not hold one client's failures against another, and valid tokens still work", async () => {
    for (let i = 0; i < 60; i++) await mcpPost(from("198.51.100.3", wellFormed(i)));
    const other = await mcpPost(from("203.0.113.9", VALID));
    expect(other.status).toBe(200);
  });

  it("successful requests do not count as failures", async () => {
    for (let i = 0; i < 40; i++) expect((await mcpPost(from("198.51.100.4", VALID))).status).toBe(200);
  });
});
