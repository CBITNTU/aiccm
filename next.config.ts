import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Keep console logs in production for debugging
  compiler: {
    removeConsole: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // Company logos in Vercel Blob. Wildcarded because the store id differs
        // per deployment target (uk/cn each get their own store — see
        // scripts/deploy-targets.mjs).
        hostname: "**.public.blob.vercel-storage.com",
        // Scoped on purpose: without it, anything writable to the store could
        // make our image optimizer proxy arbitrary bytes.
        pathname: "/company-logos/**",
      },
    ],
    // Development only. This machine's network runs DNS64/NAT64, so the blob
    // host also resolves to a synthesized 64:ff9b::/96 address; Next's SSRF
    // guard classifies anything non-unicast as private and refuses to fetch the
    // upstream image, which silently degrades every logo to the placeholder
    // tile (the 400 it returns says only '"url" parameter is not allowed' —
    // the real reason goes to the dev server log).
    //
    // Narrow by construction: the optimizer still only fetches URLs matching
    // the allowlist above, i.e. our own logo store, and production keeps the
    // guard enabled.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default withNextIntl(nextConfig);
