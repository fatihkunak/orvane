import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the surfaces that need no session: the login page, a missing path, the health probe and the security headers.
 * Everything behind sign-in is covered by docs/VERIFY.md -- minting a session in a test would mean either a login bypass or the
 * real AUTH_SECRET, and neither belongs in a public repository.
 *
 * `npm run e2e` expects a production build (`npm run build`); the config starts `next start` on its own port.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
