/**
 * Playwright 全局 setup —— 登录一次,把登录态存成 storageState 给各个用例用。
 *
 * 为什么不在每个用例里走登录表单:
 *   - 登录表单是客户端组件,每次都要等 hydration,慢且容易在断言里出意外
 *   - 这条链路要验的从来不是「登录表单能不能用」,而是押题 → 题库那条主链路
 *
 * 顺带在这里**预热**一次各页面:dev 模式第一次访问某个路由要现场编译,
 * 不预热的话第一个用到它的用例会直接超时(冷启动编译几十秒很常见)。
 */
import { request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  E2E_BASE_URL,
  E2E_EMAIL,
  E2E_PASSWORD,
  e2eArtifactsDir,
  findAppDir,
} from "./scripts/env";

export default async function globalSetup(): Promise<void> {
  const appDir = findAppDir();
  const context = await request.newContext({ baseURL: E2E_BASE_URL });

  // ── 预热(未登录):把两个页面的服务端路由编译掉 ──
  await context.get("/login");
  await context.get("/interview"); // 未登录 → 307 到 /login
  await context.get("/questions");

  // ── 登录 ──
  const res = await context.post("/api/auth/login", {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`e2e 登录失败:HTTP ${res.status()} ${await res.text()}`);
  }

  // ── 预热(已登录):这次连客户端组件一起编译掉 ──
  await context.get("/interview");
  await context.get("/questions");

  // ── 存登录态 ──
  const state = await context.storageState();
  const dir = e2eArtifactsDir(appDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "e2e-auth.json");
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  console.log(`[e2e] 登录态已存到 ${file}`);

  await context.dispose();
}
