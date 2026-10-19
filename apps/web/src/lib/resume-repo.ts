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
  template?: "classic" | "modern" | "minimal";
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

function decrypt<T extends ResumeRow | null | undefined>(row: T): T extends ResumeRow ? ResumeDecrypted : T {
  if (!row) return row as any;
  return { ...row, data: decryptResumeData(row.data) } as any;
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