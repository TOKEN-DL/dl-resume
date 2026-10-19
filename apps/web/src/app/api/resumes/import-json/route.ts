/**
 * /api/resumes/import-json — 上传 JSON Resume 文件,创建新简历.
 * F17
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createResume } from "@/lib/resume-repo";
import { safeStringify, parseResumeData } from "@/lib/validation/resume";
import { importJsonResume, JsonResumeParseError } from "@/lib/jsonresume/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.string().min(1),                  // raw JSON 字符串
  z.record(z.unknown()),             // 已解析对象
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // 也支持 text/plain 上传
    const text = await req.text().catch(() => "");
    if (!text) return NextResponse.json({ error: "empty_body" }, { status: 400 });
    raw = text;
  }

  // 允许 query 携带 title ?title=xxx,否则用文件名/默认
  const url = new URL(req.url);
  const overrideTitle = url.searchParams.get("title")?.trim() || undefined;

  let data;
  try {
    data = importJsonResume(raw);
  } catch (e) {
    if (e instanceof JsonResumeParseError) {
      return NextResponse.json({ error: "parse_failed", message: e.message }, { status: 400 });
    }
    throw e;
  }

  const title = overrideTitle || `${data.basics.name || "导入的简历"}`;
  const resume = await createResume({
    userId: session.sub,
    title,
    template: "classic",
    data: safeStringify(data),
  });

  return NextResponse.json({ resume }, { status: 201 });
}