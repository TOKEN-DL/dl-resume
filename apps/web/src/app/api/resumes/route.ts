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

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).default("未命名简历"),
  template: z.enum(["classic", "modern", "minimal"]).default("classic"),
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

  const r = await createResume({
    userId: session.sub,
    title: parsed.data.title,
    template: parsed.data.template,
  });
  return NextResponse.json({ resume: r }, { status: 201 });
}