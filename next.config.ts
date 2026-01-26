import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep console logs in production for debugging
  compiler: {
    removeConsole: false,
  },
};

export default nextConfig;
