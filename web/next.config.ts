import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Coinbase SDK (via the Base Account connector) lazy-imports optional @x402/* peers.
  // Leave it to Node at runtime so the bundler doesn't try to resolve them.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  cacheComponents: true,
  partialPrefetching: true,
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
