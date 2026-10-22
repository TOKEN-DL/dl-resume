/**
 * /api/resumes/[id]/pdf — 服务端渲染 PDF,返回 application/pdf.
 * F16
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertOwnership, errorMessage, type ResumeDecrypted } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { registerFontsOnce } from "@/lib/pdf/font";
import { ResumeDocument } from "@/lib/pdf/documents";
import { getTemplate } from "@/lib/templates";

export const runtime = "nodejs"; // 需要文件系统访问字体
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // 必须走 assertOwnership — 它内部会解密(F18),不要绕过 repo 直接查 prisma
  let resume: ResumeDecrypted;
  try {
    resume = await assertOwnership(id, session.sub);
  } catch (e: unknown) {
    const msg = errorMessage(e);
    if (msg === "Forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 模板 id 来自注册表;未知 id 自动回退到 classic(与预览端行为一致)
  const template = getTemplate(resume.template).id;
  const data = parseResumeData(resume.data);

  // 注册字体(memoized,只跑一次)
  try {
    await registerFontsOnce();
  } catch (e: unknown) {
    const msg = errorMessage(e);
    console.error("[pdf] font registration failed", e);
    return NextResponse.json(
      { error: "font_unavailable", message: msg || "字体资源缺失,请运行 npm run setup:fonts" },
      { status: 500 },
    );
  }

  let buffer: Buffer;
  try {
    // dynamic import — react-pdf 是 ESM-only,Next.js RSC bundler 会误处理顶层 import
    const { renderToBuffer } = await import("@react-pdf/renderer");
    buffer = await renderToBuffer(
      ResumeDocument({ data, template }),
    );
  } catch (e: unknown) {
    console.error("[pdf] render failed", e);
    return NextResponse.json(
      { error: "render_failed", message: errorMessage(e) || String(e) },
      { status: 500 },
    );
  }

  const filename = `${(resume.title || "简历").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}