/**
 * e2e 服务端启动脚本。
 *
 * Playwright 的 webServer 只负责「把这条命令跑起来,等这个地址能访问」,
 * 具体的准备步骤都写在这儿 —— 三步:
 *
 *   1. **重建 e2e 库**:`prisma migrate reset --force --skip-seed --skip-generate`
 *      清掉上一次的残留,重新应用两个迁移。
 *      --skip-generate 是必须的:客户端装在跟主仓库共用的 node_modules 里,
 *      重新生成会碰到正被主仓库 dev server 占着的引擎 DLL(EPERM)。
 *   2. **seed**:一个专用用户 + 一份简历(见 seed.ts)。
 *   3. **起 next dev**:端口 3110,跟主仓库的 3000 隔开。
 *
 * 跑法:
 *   npx tsx e2e/scripts/start-server.ts              # 起服务端(Playwright 用这个)
 *   npx tsx e2e/scripts/start-server.ts --setup-only # 只重建库 + seed,不起服务端
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { E2E_PORT, e2eEnv, findAppDir } from "./env";
import { seedE2E } from "./seed";

/** 跑一个子进程,等它退出;退出码非 0 就抛 */
function runNode(
  script: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(script)} ${args.join(" ")} 退出码 ${code}`));
    });
  });
}

/** 重建 e2e 库 + 写种子数据 */
async function resetAndSeed(appDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const prismaCli = path.join(appDir, "node_modules", "prisma", "build", "index.js");
  console.log("[e2e] 重建 e2e 库…");
  await runNode(
    prismaCli,
    ["migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
    appDir,
    env,
  );
  console.log("[e2e] 写种子数据…");
  await seedE2E();
}

async function main(): Promise<void> {
  const appDir = findAppDir();
  const env = e2eEnv(appDir);

  // 关键:把 e2e 环境**灌进当前进程**。
  // seed 是在这个进程里跑的(不是子进程),而 Prisma 客户端会自动去读
  // apps/web/.env —— 不显式覆盖的话,seed 会写进 dev.db 快照里。
  // 子进程(prisma CLI / next dev)再从 process.env 继承,三处就一致了。
  Object.assign(process.env, env);

  await resetAndSeed(appDir, env);

  if (process.argv.includes("--setup-only")) {
    console.log("[e2e] --setup-only:库已重建并写好种子,不起服务端。");
    return;
  }

  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  console.log(`[e2e] 起 next dev:${E2E_PORT}…`);
  const server: ChildProcess = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(E2E_PORT), "-H", "127.0.0.1"],
    { cwd: appDir, env, stdio: "inherit" },
  );

  const stop = () => {
    if (!server.killed) server.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  server.on("exit", (code) => {
    console.log(`[e2e] next dev 退出,退出码 ${code}`);
    process.exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error("[e2e] 启动失败:", e);
  process.exit(1);
});
