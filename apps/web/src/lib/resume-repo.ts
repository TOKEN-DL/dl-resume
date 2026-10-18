/**
 * Resume repository — thin layer over Prisma for testability.
 * F2: 我的简历列表 CRUD
 */
import { prisma } from "./prisma";

export interface CreateResumeInput {
  userId: string;
  title: string;
  template?: "classic" | "modern" | "minimal";
  data?: string; // JSON string
}

export async function createResume(input: CreateResumeInput) {
  return prisma.resume.create({
    data: {
      userId: input.userId,
      title: input.title,
      template: input.template ?? "classic",
      data: input.data ?? "{}",
    },
  });
}

export async function listResumesByUser(userId: string) {
  return prisma.resume.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function findResumeById(id: string) {
  return prisma.resume.findUnique({ where: { id } });
}

export async function updateResume(
  id: string,
  data: { title?: string; template?: string; data?: string },
) {
  return prisma.resume.update({ where: { id }, data });
}

export async function deleteResume(id: string) {
  return prisma.resume.delete({ where: { id } });
}

export async function duplicateResume(sourceId: string, userId: string) {
  const src = await prisma.resume.findUnique({ where: { id: sourceId } });
  if (!src) throw new Error("Source resume not found");
  return prisma.resume.create({
    data: {
      userId,
      title: `${src.title} · 副本`,
      template: src.template,
      data: src.data,
    },
  });
}

/** 检查简历是否属于该用户(权限校验) */
export async function assertOwnership(resumeId: string, userId: string) {
  const r = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!r) throw new Error("Resume not found");
  if (r.userId !== userId) throw new Error("Forbidden");
  return r;
}