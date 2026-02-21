import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep console logs in production for debugging
  compiler: {
    removeConsole: false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
