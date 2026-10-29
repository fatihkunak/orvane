import { describe, expect, it } from "vitest";
import { inngestRequestAllowed } from "@/lib/inngest-guard";

/** Dev mode Inngest runs unsigned requests, so /api/inngest must not be reachable through the public tunnel. */

const req = (headers: Record<string, string>) => new Headers(headers);
const dev = { INNGEST_DEV: "1" };
const signed = { INNGEST_SIGNING_KEY: "signkey-prod-x" };

describe("inngestRequestAllowed", () => {
  it("lets the local Dev Server in", () => {
    expect(inngestRequestAllowed(req({ host: "localhost:3055" }), dev)).toBe(true);
    expect(inngestRequestAllowed(req({ host: "127.0.0.1:3055" }), dev)).toBe(true);
    expect(inngestRequestAllowed(req({ host: "[::1]:3055" }), dev)).toBe(true);
  });

  it("rejects the tunnel and any non-loopback host in dev mode", () => {
    expect(inngestRequestAllowed(req({ host: "orvane-dev.fatihgo.com" }), dev)).toBe(false);
    expect(inngestRequestAllowed(req({ host: "localhost:3055", "cf-connecting-ip": "203.0.113.9" }), dev)).toBe(false);
    expect(inngestRequestAllowed(req({ host: "localhost", "cf-ray": "abc" }), dev)).toBe(false);
    expect(inngestRequestAllowed(req({ host: "192.168.1.20:3055" }), dev)).toBe(false);
    expect(inngestRequestAllowed(req({}), dev)).toBe(false);
  });

  it("treats a missing signing key as dev mode", () => {
    expect(inngestRequestAllowed(req({ host: "orvane.example.com" }), {})).toBe(false);
  });

  it("does not trust a signing key while INNGEST_DEV is on (the SDK skips signatures then)", () => {
    expect(inngestRequestAllowed(req({ host: "orvane.example.com" }), { ...signed, INNGEST_DEV: "1" })).toBe(false);
  });

  it("leaves signed (cloud) mode to the SDK's own signature check", () => {
    expect(inngestRequestAllowed(req({ host: "orvane.example.com", "cf-ray": "abc" }), signed)).toBe(true);
    expect(inngestRequestAllowed(req({ host: "orvane.example.com" }), { ...signed, INNGEST_DEV: "0" })).toBe(true);
  });
});
