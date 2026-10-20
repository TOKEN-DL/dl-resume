/**
 * /api/resumes/[id]/export-json — 返回符合 jsonresume.org schema 的 .json 文件.
 * F17
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertOwnership } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { exportJsonResume } from "@/lib/jsonresume/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // 必须走 assertOwnership — 它内部会解密(F18),不要绕过 repo 直接查 prisma
  let resume;
  try {
    resume = await assertOwnership(id, session.sub);
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (msg === "Forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data = parseResumeData(resume.data);
  const json = exportJsonResume(data);
  const body = JSON.stringify(json, null, 2);

  const filename = `${(resume.title || "简历").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}