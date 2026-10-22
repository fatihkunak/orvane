import { expect, test } from "@playwright/test";

/**
 * Public surfaces only. These run against a production build and need a database (the health probe queries it), but no session:
 * the whole point is that a fresh clone can verify "it boots and serves" in CI without touching a real account.
 */

test("health endpoint reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, db: true });
});

test("login page renders and offers Google", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
});

test("a missing path gets our own 404 page", async ({ page }) => {
  const res = await page.goto("/boyle-bir-sayfa-yok");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bu sayfa yok" })).toBeVisible();
});

test("protected pages redirect to login when signed out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("security headers are present, CSP is report-only", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  // Report-Only first: an enforcing policy needs nonces, see next.config.ts
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toBeUndefined();
});
