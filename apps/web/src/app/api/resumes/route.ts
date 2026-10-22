/**
 * /api/resumes — 我的简历列表 + 新建
 * F2
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  listResumesByUser,
  createResume,
} from "@/lib/resume-repo";
import { isTemplateId } from "@/lib/templates";
import { repairResumeData, safeStringify } from "@/lib/validation/resume";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).default("未命名简历"),
  // 模板 id 由注册表动态校验(32 套),不再硬编码 z.enum
  template: z.string().trim().min(1).max(60).default("classic"),
  // 从模板新建时可预填范文(ResumeData 对象);非法结构会被 repairResumeData 抢救
  data: z.unknown().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const list = await listResumesByUser(session.sub);
  return NextResponse.json({ resumes: list });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!isTemplateId(parsed.data.template)) {
    return NextResponse.json(
      { error: `未知模板: ${parsed.data.template}` },
      { status: 400 },
    );
  }

  const data =
    parsed.data.data === undefined
      ? undefined
      : safeStringify(repairResumeData(parsed.data.data));

  const r = await createResume({
    userId: session.sub,
    title: parsed.data.title,
    template: parsed.data.template,
    data,
  });
  return NextResponse.json({ resume: r }, { status: 201 });
}