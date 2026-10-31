import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";

const nextConfig = (phase: string): NextConfig => ({
  output: "standalone",
  reactStrictMode: true,
  // dev 和 build 必须写不同的目录:两者共用 .next/ 时,
  // `next build` 会用生产布局(chunks/、vendor-chunks/)覆盖 dev 的产物,
  // dev server 随后 require('./611.js') 就会 MODULE_NOT_FOUND。
  // 生产构建与 standalone 输出仍留在 .next/,Dockerfile 无需改动。
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  /**
   * 文件追踪根必须是**仓库根**,不是应用目录。
   *
   * Next 默认往上找 lockfile 来推断 workspace root,而这个仓库根没有
   * package.json —— 推断结果取决于机器上上层目录里有什么,完全不可控:
   * 本机因为 D:\code 下有个残留的 package-lock.json,追踪根被推成了 D:\code,
   * standalone 产物就变成了 .next/standalone/coding/dl-resume/apps/web/server.js。
   *
   * Dockerfile 期望的是 .next/standalone/apps/web/server.js
   * (COPY standalone → /app,然后 node apps/web/server.js),
   * 容器里同样推断不出 /app 这个根。显式钉死成仓库根,两边才对得上。
   */
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // react-pdf 4.x 是 ESM-only,不要被 Next bundling 处理,直接走 Node runtime
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb", // resume JSON can be large
    },
  },
});

export default nextConfig;