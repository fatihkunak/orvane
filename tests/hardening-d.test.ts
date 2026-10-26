import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits, rateLimitKeyCount, takeToken } from "@/lib/ai/rate-limit";
import { adminGuard } from "@/lib/admin-api";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u-upload" } })) }));
vi.mock("@/lib/media-store", () => ({ storeMediaBytes: vi.fn(async () => ({ url: "/api/media/x.png", kind: "image" })) }));
import { POST as uploadPost } from "@/app/api/upload/route";

beforeEach(() => resetRateLimits());

describe("rate limiter memory", () => {
  it("drops keys whose window has fully expired instead of keeping them forever", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3000; i++) takeToken(`k${i}`, 5, 60_000, t0);
    expect(rateLimitKeyCount()).toBe(3000);
    // Much later, new calls sweep the stale keys
    for (let i = 0; i < 2000; i++) takeToken(`n${i}`, 5, 60_000, t0 + 10 * 60_000);
    expect(rateLimitKeyCount()).toBeLessThan(2500);
  });

  it("never exceeds a hard cap even when every key is still live", () => {
    for (let i = 0; i < 25_000; i++) takeToken(`live${i}`, 5, 60 * 60_000, 5_000_000);
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(20_000);
  });
});

describe("adminGuard failure limiter", () => {
  const env = { ORVANE_ADMIN_TOKEN: "t".repeat(40) } as unknown as NodeJS.ProcessEnv;
  it("cannot be bypassed by rotating X-Forwarded-For", () => {
    let blocked = 0;
    for (let i = 0; i < 200; i++) {
      const res = adminGuard(new Request("http://x/api/admin/users", { headers: { authorization: "Bearer wrong", "x-forwarded-for": `198.51.100.${i % 250}, 10.0.0.1` } }), env);
      if (res?.status === 429) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("upload route", () => {
  it("rejects a declared body larger than the biggest allowed file before buffering it", async () => {
    const req = new Request("http://x/api/upload", {
      method: "POST",
      headers: { "content-length": String(500 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
      body: "--x--",
    });
    const res = await uploadPost(req);
    expect(res.status).toBe(413);
  });
});
