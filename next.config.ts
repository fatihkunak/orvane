import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened via 127.0.0.1 too (separate cookie jar from localhost)
  allowedDevOrigins: ["127.0.0.1"],
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
