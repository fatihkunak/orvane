import path from "node:path";
import { defineConfig } from "vitest/config";
import "dotenv/config"; // DATABASE_URL etc. for the integration tests

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // `server-only` throws outside Next's server bundles; tests run in plain Node
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one database, so run files one after another
    fileParallelism: false,
    env: { TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
  },
});
