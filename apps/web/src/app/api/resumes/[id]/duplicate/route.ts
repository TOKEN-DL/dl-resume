/**
 * /api/resumes/[id]/duplicate — 复制简历
 * F2
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertOwnership, duplicateResume } from "@/lib/resume-repo";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await assertOwnership(id, session.sub);
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (msg === "Forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const r = await duplicateResume(id, session.sub);
    return NextResponse.json({ resume: r }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "duplicate_failed" }, { status: 500 });
  }
}