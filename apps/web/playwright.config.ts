/**
 * Playwright 配置 —— 「面试押题」端到端验证(#25)。
 *
 * 几条硬约束,都是被这个功能的特性逼出来的:
 *
 *   - **独立的库与端口**:e2e 用自己的 SQLite 库(apps/web/prisma/e2e.db)
 *     和 3100 端口,不碰主仓库的开发库,也不跟占着 3000 的 dev server 打架。
 *   - **串行**:e2e 共用同一个库、同一个服务端进程、同一套「先押题再入库再押第二次」
 *     的状态链,用例之间有前后依赖 —— workers 必须 1,fullyParallel 必须 false。
 *   - **每次都从干净状态开始**:webServer 的启动脚本会重建库并重新 seed,
 *     所以连跑两次的结果一致,不依赖上一次留下的残留。
 *
 * 想单独看某一条链路:`npx playwright test e2e/interview.spec.ts -g "再押一次"`。
 */
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { E2E_BASE_URL, E2E_PORT, e2eArtifactsDir, findAppDir } from "./e2e/scripts/env";

/** apps/web 目录 */
const APP_DIR = findAppDir();
/** 产物目录(登录态、trace、截图)—— 放在 .tmp/ 下,根 .gitignore 已忽略 */
const ARTIFACTS = e2eArtifactsDir(APP_DIR);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,

  /** 登录一次,登录态存成 storageState 给各用例用 */
  globalSetup: path.join(APP_DIR, "e2e", "global-setup.ts"),

  /** 串行:用例之间有前后依赖(第一轮押题的结果是第二轮的前提) */
  fullyParallel: false,
  workers: 1,
  retries: 0,

  /** dev 模式首次编译路由很慢,超时给足 */
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // 报告落在 .tmp/ 下(根 .gitignore 已忽略),不会把工作区弄脏
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(ARTIFACTS, "playwright-report"), open: "never" }],
  ],
  outputDir: path.join(ARTIFACTS, "playwright-artifacts"),

  use: {
    baseURL: E2E_BASE_URL,
    storageState: path.join(ARTIFACTS, "e2e-auth.json"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  webServer: {
    /** 重建库 → seed → 起 next dev(细节见 e2e/scripts/start-server.ts) */
    command: "npx tsx e2e/scripts/start-server.ts",
    cwd: APP_DIR,
    /** 页面能访问就说明服务端起来了 */
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    /** 冷启动要重新装依赖 + 编译,给足 4 分钟 */
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { E2E_PORT: String(E2E_PORT) },
  },
});
