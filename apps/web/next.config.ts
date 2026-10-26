import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  output: "standalone",
  reactStrictMode: true,
  // dev 和 build 必须写不同的目录:两者共用 .next/ 时,
  // `next build` 会用生产布局(chunks/、vendor-chunks/)覆盖 dev 的产物,
  // dev server 随后 require('./611.js') 就会 MODULE_NOT_FOUND。
  // 生产构建与 standalone 输出仍留在 .next/,Dockerfile 无需改动。
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  // react-pdf 4.x 是 ESM-only,不要被 Next bundling 处理,直接走 Node runtime
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb", // resume JSON can be large
    },
  },
});

export default nextConfig;