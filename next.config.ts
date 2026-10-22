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
  /**
   * Baseline security headers. Deliberately no Content-Security-Policy: Next injects inline bootstrap scripts, and a policy
   * without per-request nonces either breaks the app or is loose enough to be theatre. The rest are free wins:
   * no MIME sniffing, no framing, no referrer leak to third parties, no device permissions we never ask for.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
