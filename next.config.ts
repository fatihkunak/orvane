import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev origins besides localhost: 127.0.0.1 (separate cookie jar) and the HTTPS tunnel that
  // Threads requires for its redirect URI (Cloudflare tunnel "orvane-dev" -> localhost:3055)
  allowedDevOrigins: ["127.0.0.1", "orvane-dev.fatihgo.com"],
  // The dev server prints every Server Function call WITH its arguments; for the AI settings actions that is the user's API key.
  logging: { serverFunctions: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
