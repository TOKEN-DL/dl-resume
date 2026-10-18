import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb", // resume JSON can be large
    },
  },
  // PDF renderer needs these transpiled for Node runtime
  transpilePackages: ["@react-pdf/renderer"],
};

export default nextConfig;