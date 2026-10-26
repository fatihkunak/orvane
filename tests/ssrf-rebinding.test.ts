import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { guardedFetch } from "@/lib/ai/safe-fetch";

/**
 * DNS rebinding: a name passes the address check (it resolves to a public IP), then resolves to an internal one when the
 * connection is actually made. The model: `rebind.test` answers with whatever the test says at connect time.
 */

let server: http.Server;
let port: number;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits++;
    res.end("internal secret");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  hits = 0;
});

/** What `rebind.test` resolves to at connect time (works for both the callback shapes `net` uses). */
function resolveTo(...addresses: string[]) {
  vi.spyOn(dns, "lookup").mockImplementation(((host: string, opts: unknown, cb?: unknown) => {
    const callback = (typeof opts === "function" ? opts : cb) as (...a: unknown[]) => void;
    const all = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
    const list = addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    if (all) callback(null, list);
    else callback(null, list[0]!.address, list[0]!.family);
  }) as unknown as typeof dns.lookup);
}

describe("DNS rebinding", () => {
  it("is real: a plain fetch follows a name that now resolves to an internal address", async () => {
    resolveTo("127.0.0.1");
    const res = await fetch(`http://rebind.test:${port}/`);
    expect(await res.text()).toBe("internal secret");
    expect(hits).toBe(1);
  });

  it("is stopped at connect time by the guarded fetch", async () => {
    resolveTo("127.0.0.1");
    await expect(guardedFetch(`http://rebind.test:${port}/`)).rejects.toThrow();
    expect(hits).toBe(0);
  });

  it("refuses a name that resolves to a mix of public and internal addresses", async () => {
    resolveTo("93.184.216.34", "10.0.0.5");
    await expect(guardedFetch(`http://rebind.test:${port}/`)).rejects.toThrow();
    expect(hits).toBe(0);
  });

  it("keeps local development working when private addresses are explicitly allowed", async () => {
    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1");
    resolveTo("127.0.0.1");
    const res = await guardedFetch(`http://rebind.test:${port}/`);
    expect(await res.text()).toBe("internal secret");
    expect(hits).toBe(1);
  });
});
