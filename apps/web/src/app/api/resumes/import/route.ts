/**
 * /api/resumes/import — 落库客户端解析好的简历数据。
 *
 * F20 的解析(PDF/Word/Markdown → 文本 → ResumeData)全部在浏览器里完成,
 * 服务端只负责校验 + 加密落库,和 F17 的 import-json 走同一条链路。
 *
 * 注意:这里收不到原始文件,所以"文件不上传"这个承诺依然成立。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createResume } from "@/lib/resume-repo";
import { isTemplateId } from "@/lib/templates";
import { safeStringify, repairResumeData } from "@/lib/validation/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // 模板 id 由注册表动态校验,不再硬编码 z.enum
  template: z.string().trim().min(1).max(60).optional(),
  data: z.unknown(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  // 模板 id 必须命中注册表
  if (parsed.data.template !== undefined && !isTemplateId(parsed.data.template)) {
    return NextResponse.json(
      { error: `未知模板: ${parsed.data.template}` },
      { status: 400 },
    );
  }

  // 抽取器是保守的,可能留空若干字段;统一修复成合法结构再落库。
  const data = repairResumeData(parsed.data.data);

  // 必填项缺失不阻断导入 —— 读取侧同样走 repair,不会丢数据,
  // 但要把清单回给前端,由 UI 提示用户去编辑器补齐。
  const missingFields: string[] = [];
  if (!data.basics.name.trim()) missingFields.push("姓名");
  if (!EMAIL_RE.test(data.basics.email.trim())) missingFields.push("邮箱");

  const title =
    parsed.data.title?.trim() ||
    data.basics.name.trim() ||
    "导入的简历";

  const resume = await createResume({
    userId: session.sub,
    title,
    template: parsed.data.template ?? "classic",
    data: safeStringify(data),
  });

  return NextResponse.json({ resume, missingFields }, { status: 201 });
}