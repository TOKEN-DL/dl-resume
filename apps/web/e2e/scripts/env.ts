/**
 * E2E 跑测用的共享常量与工具。
 *
 * 为什么单独一个文件 —— 启动脚本(重建库 + seed + 起服务端)、
 * Playwright 全局 setup(登录换 storageState)、用例文件都要用同一套
 * 端口 / 账号 / 简历种子,写在一处才不会跑偏。
 */
import fs from "node:fs";
import path from "node:path";

/**
 * e2e 服务端端口 —— 主仓库的 dev server 占着 3000,e2e 另开一个。
 *
 * 原定 3100,但那台机器上 3100 已经被一个无关的常驻进程
 * (`node server/index.js`)占着,Playwright 会直接报「端口已被占用」。
 * 3110 是实测空着的。
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3110);

/** e2e 服务端地址 */
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** e2e 专用账号 —— 跟 .env 里的管理员账号分开,免得跟开发数据混 */
export const E2E_EMAIL = "e2e@example.com";
export const E2E_PASSWORD = "e2e-password-123";

/** 种子简历 A 的标题 —— 6 个技能,关键词池大 */
export const E2E_RESUME_TITLE = "E2E 测试简历";

/** 种子简历 B 的标题 —— 1 个技能,关键词池小 */
export const E2E_RESUME_TITLE_NARROW = "E2E 测试简历-窄";

/**
 * 种子简历 A 的技能池 —— **恰好 6 个,项目为 0**。
 *
 * 6 这个数字是算出来的,不是随手填的:本地兜底出题按「槽位 × 关键词」的
 * **组合**去重(12 个槽位 × 池长),池长 6 → 组合空间 72。
 * 所以第二轮押题能出 12 道**全新**的题 —— 组合没用完,不会退回老组合。
 *
 * 反过来,池长 1 的简历(见 E2E_SKILLS_NARROW)组合空间只有 12,
 * 第一轮就用光了,第二轮必然跟第一轮一模一样 → 触发整套高度重复的拦截。
 */
export const E2E_SKILLS = [
  "TypeScript",
  "PostgreSQL",
  "Redis",
  "Docker",
  "Kubernetes",
  "React",
];

/**
 * 种子简历 B 的技能池 —— **只有 1 个**,项目为 0 → 组合空间只有 12 个。
 *
 * 这个技能**不能**跟简历 A 的池子重叠:重叠的话,简历 B 的题会跟简历 A
 * 已入库的题撞上(跨套判重 R1/R3),入库时被跳过,题库总数与提示条上的
 * 「重复了 N / 12 题」都对不上父任务预期的 36 与 12/12。
 * 所以这里用简历 A 里没有的 Elixir。
 */
export const E2E_SKILLS_NARROW = ["Elixir"];

/**
 * 找到 apps/web 目录(认 prisma/schema.prisma)。
 *
 * 不写死路径:脚本可能从仓库根、apps/web、或者别的目录被拉起来,
 * 往上找一遍比赌一个 cwd 靠谱。
 */
export function findAppDir(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    const candidates = [
      path.join(dir, "prisma", "schema.prisma"),
      path.join(dir, "apps", "web", "prisma", "schema.prisma"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return path.dirname(path.dirname(candidate));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 apps/web(从 ${start} 往上找没看到 prisma/schema.prisma)`);
}

/**
 * e2e 专用 SQLite 库的 file: URL。
 *
 * **必须用绝对路径** —— Prisma 客户端把相对路径按「生成客户端时 schema 所在目录」
 * 解析,而 node_modules 是跟主仓库共用的(junction),相对路径会落到**主仓库**的
 * prisma 目录里去,踩到开发库。用绝对路径才不会串。
 */
export function e2eDatabaseUrl(appDir: string): string {
  const abs = path.join(appDir, "prisma", "e2e.db");
  // Prisma 的 file: URL 用正斜杠;路径里有空格要转义
  const posix = abs.replace(/\\/g, "/").replace(/ /g, "%20");
  return `file:${posix}`;
}

/**
 * e2e 进程的环境变量。
 *
 * 两处关键覆盖:
 *   - DATABASE_URL:指向 e2e 专用库,不碰开发库
 *   - MINIMAX_API_KEY:置空。Next 的 env 加载逻辑是「进程环境里已经有这个键
 *     (哪怕值是空串)就不被 .env 覆盖」,所以空串能可靠地关掉模型路径,
 *     押题走本地兜底模板引擎 —— 确定性、可重复、不烧额度、不依赖网络。
 */
export function e2eEnv(appDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(appDir),
    MINIMAX_API_KEY: "",
    NODE_ENV: "development",
  };
}

/** 产物目录 —— 放 .tmp/ 下,根 .gitignore 已经忽略,不会把工作区弄脏 */
export function e2eArtifactsDir(appDir: string): string {
  return path.join(appDir, ".tmp");
}
