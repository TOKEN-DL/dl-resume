/**
 * e2e 种子数据 —— 一个专用用户 + 一份简历。
 *
 * 每次 e2e 跑之前数据库都是重建过的(见 start-server.ts),所以这里是
 * **纯插入**:没有「已存在就跳过」的分支,库里多一条就是脏数据。
 *
 * 密码用 src/lib/auth 的 hashPassword 加密(Argon2id),跟登录接口
 * 校验的是同一套 —— 别自己造哈希。
 */
import { E2E_EMAIL, E2E_PASSWORD, E2E_RESUME_TITLE, E2E_SKILLS } from "./env";

/**
 * 种子简历的正文 —— 结构照 src/lib/validation/resume.ts 的 ResumeDataSchema。
 *
 * 只有 basics + skills 是有意义的:
 *   - basics 必填字段填齐(name / label / email)
 *   - skills **恰好 6 条**(见 E2E_SKILLS 的注释:12 % 6 = 0 才能让第二轮
 *     押题出跟第一轮一模一样的 12 道题,跨套判重才真的触发)
 *   - projects **必须为空** —— 项目名也会进关键词池,多一个名字池长就变了
 *
 * data 字段存明文 JSON:简历正文的密文格式带 "v1.enc:" 前缀,
 * 解密时旧明文会自动识别并原样返回(见 crypto/resume-cipher.ts)。
 */
function seedResumeData() {
  return {
    basics: {
      name: "E2E 候选人",
      label: "高级后端工程师",
      email: E2E_EMAIL,
      phone: "",
      gender: "",
      location: "",
      avatar: "",
      summary: "端到端测试用的种子简历",
    },
    summary: "",
    education: [],
    work: [],
    projects: [],
    skills: E2E_SKILLS.map((name, i) => ({
      id: `s${i + 1}`,
      name,
      level: "advanced",
    })),
    languages: [],
    awards: [],
    certificates: [],
    interests: "",
  };
}

/**
 * 确认连上的确实是 e2e 专用库。
 *
 * 这一步是防御性的:Prisma 客户端会自己去读 apps/web/.env,里面的
 * DATABASE_URL 指向 dev.db —— 一旦环境变量没灌进来,种子数据就会
 * **静悄悄地写进开发库**。宁可当场报错,也不要污染开发数据。
 */
async function assertE2EDatabase(prisma: {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe("PRAGMA database_list")) as Array<{
    name: string;
    file: string | null;
  }>;
  const main = rows.find((r) => r.name === "main");
  const file = main?.file ?? "";
  if (!file.replace(/\\/g, "/").toLowerCase().endsWith("/e2e.db")) {
    throw new Error(
      `连上的不是 e2e 专用库(实际是 ${file || "内存库"})。` +
        `DATABASE_URL 必须指向 apps/web/prisma/e2e.db,别写到开发库里去。`,
    );
  }
}

/** 写入种子数据 */
export async function seedE2E(): Promise<void> {
  // 动态 import:Prisma 客户端在**创建时**读 DATABASE_URL,
  // 必须保证调用方已经把环境变量设好再加载这个模块。
  const { prisma } = await import("../../src/lib/prisma");
  const { hashPassword } = await import("../../src/lib/auth");

  await assertE2EDatabase(prisma);

  const passwordHash = await hashPassword(E2E_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: E2E_EMAIL,
      passwordHash,
      name: "E2E 用户",
      isAdmin: false,
    },
  });

  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: E2E_RESUME_TITLE,
      template: "classic",
      data: JSON.stringify(seedResumeData()),
    },
  });

  console.log(
    `[e2e] 种子就绪:用户 ${user.email} / 简历「${resume.title}」` +
      `(${resume.id})/ 技能 ${E2E_SKILLS.length} 个`,
  );
}
