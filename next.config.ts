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
   * Baseline security headers. The CSP is REPORT-ONLY on purpose: Next injects inline bootstrap scripts, so an enforcing policy
   * needs per-request nonces (middleware) before it can ship without breaking the app. Report-only never blocks anything -- it
   * keeps the intended policy in the repository and shows violations in the browser console, so promoting it later is a switch,
   * not a rewrite. See docs/wiki/Security.md.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "media-src 'self' https://res.cloudinary.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      // Dev chunks keep their URL when their code changes. Behind the Cloudflare tunnel "no-cache" is rewritten to the zone's
      // 4-hour browser TTL, so browsers ran stale JS after every change or update; "no-store" is passed through untouched.
      // Production chunks are content-hashed and immutable, so this applies to `next dev` only.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [{ source: "/_next/static/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] }]),
    ];
  },
};

export default nextConfig;
