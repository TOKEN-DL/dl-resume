import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // react-pdf 4.x 是 ESM-only,不要被 Next bundling 处理,直接走 Node runtime
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb", // resume JSON can be large
    },
  },
};

export default nextConfig;