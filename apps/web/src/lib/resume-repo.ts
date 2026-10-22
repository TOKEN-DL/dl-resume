/**
 * Resume repository — thin layer over Prisma for testability.
 * F2: 我的简历列表 CRUD
 * F18: Resume.data 字段在数据库中是密文,API 返回明文
 */
import { prisma } from "./prisma";
import { encryptResumeData, decryptResumeData } from "./crypto/resume-cipher";

export interface CreateResumeInput {
  userId: string;
  title: string;
  /** 模板 id;取值范围由 lib/templates 的注册表约束(API 层已校验) */
  template?: string;
  data?: string; // 明文 JSON 字符串
}

/** 加密的 .data 字段,内部使用 */
type ResumeRow = {
  id: string;
  userId: string;
  title: string;
  template: string;
  data: string;
  createdAt: Date;
  updatedAt: Date;
};

/** 解密后的 .data 字段,返回给调用方 */
export type ResumeDecrypted = Omit<ResumeRow, "data"> & { data: string };

/**
 * 重载让 `decrypt(row: ResumeRow)` 在调用点拿到窄化的 ResumeDecrypted,
 * 而不是和 null/undefined 分支混合的并集 —— 这样下游 listResumesByUser
 * 这种纯数组返回的函数无需再写 .filter 收紧类型。
 */
function decrypt(row: ResumeRow): ResumeDecrypted;
function decrypt(row: ResumeRow | null | undefined): ResumeDecrypted | null | undefined;
function decrypt(row: ResumeRow | null | undefined): ResumeDecrypted | null | undefined {
  if (!row) return row;
  return { ...row, data: decryptResumeData(row.data) };
}

/**
 * 从 unknown 抓错误消息。
 * assertOwnership / Prisma / 我们自己的 throw 都可能冒上来,行为要稳:
 *  - 真 Error 实例 → 直接 .message
 *  - 普通对象(被当成错误 throw 的 `{ message: "Forbidden" }`)→ 取 .message
 *  - 字符串 throw → 整串
 *  - 其他 → 空串(调用方就会走 404 分支,行为不变)
 *
 * 不替换成 `e instanceof Error ? e.message : ""` —— 上层依赖 "Forbidden"
 * 精确匹配生成 403,丢掉非 Error 分支会让所有权限错误退化成 404,接口语义悄悄坏掉。
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return typeof e === "string" ? e : "";
}

export async function createResume(input: CreateResumeInput) {
  const row = await prisma.resume.create({
    data: {
      userId: input.userId,
      title: input.title,
      template: input.template ?? "classic",
      data: encryptResumeData(input.data ?? "{}"),
    },
  });
  return decrypt(row);
}

export async function listResumesByUser(userId: string) {
  const rows = await prisma.resume.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => decrypt(r));
}

/**
 * 只取列表元信息(id / 标题 / 模板 / 时间),**不解密正文**。
 *
 * 导航栏的「最近编辑」只需要这几列;走 listResumesByUser 会把每份简历的
 * 密文全部解密一遍,首页这种只要列表的场景纯属浪费。
 */
export async function listResumeSummaries(userId: string) {
  return prisma.resume.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      template: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findResumeById(id: string) {
  const row = await prisma.resume.findUnique({ where: { id } });
  return decrypt(row);
}

export async function updateResume(
  id: string,
  data: { title?: string; template?: string; data?: string },
) {
  const patch: { title?: string; template?: string; data?: string } = { ...data };
  if (typeof patch.data === "string") {
    patch.data = encryptResumeData(patch.data);
  }
  const row = await prisma.resume.update({ where: { id }, data: patch });
  return decrypt(row);
}

export async function deleteResume(id: string) {
  return prisma.resume.delete({ where: { id } });
}

export async function duplicateResume(sourceId: string, userId: string) {
  const src = await prisma.resume.findUnique({ where: { id: sourceId } });
  if (!src) throw new Error("Source resume not found");
  // src.data 已是密文,直接复用即可
  const row = await prisma.resume.create({
    data: {
      userId,
      title: `${src.title} · 副本`,
      template: src.template,
      data: src.data,
    },
  });
  return decrypt(row);
}

/** 检查简历是否属于该用户(权限校验)— 返回明文 row */
export async function assertOwnership(resumeId: string, userId: string) {
  const r = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!r) throw new Error("Resume not found");
  if (r.userId !== userId) throw new Error("Forbidden");
  return decrypt(r);
}