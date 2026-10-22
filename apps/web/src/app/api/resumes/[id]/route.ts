/**
 * /api/resumes/[id] — PATCH(重命名) + DELETE
 * F2
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import {
  assertOwnership,
  deleteResume,
  updateResume,
} from "@/lib/resume-repo";
import { isTemplateId } from "@/lib/templates";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // 模板 id 由注册表动态校验,不再硬编码 z.enum —— 见下方 isTemplateId 检查
  template: z.string().trim().min(1).max(60).optional(),
  // 200KB 上限 — 简历 JSON 通常 < 50KB,这个余量足够;超过意味着滥用
  data: z.string().max(200_000).optional(),
});

/**
 * POST 别名 — navigator.sendBeacon() 只能发 POST,不能发 PATCH。
 * 页面关闭 / 路由离开时浏览器用它做最后一次保存(F15 验收要求"刷新页面不丢数据")。
 * 语义与 PATCH 完全一致:按需更新传入的字段。
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return PATCH(req, ctx);
}

export async function PATCH(
  req: Request,
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

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 模板 id 必须命中注册表 —— 与 POST /api/resumes 用同一套判定
  if (parsed.data.template !== undefined && !isTemplateId(parsed.data.template)) {
    return NextResponse.json(
      { error: `未知模板: ${parsed.data.template}` },
      { status: 400 },
    );
  }

  try {
    const r = await updateResume(id, parsed.data);
    return NextResponse.json({ resume: r });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(
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
    await deleteResume(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}