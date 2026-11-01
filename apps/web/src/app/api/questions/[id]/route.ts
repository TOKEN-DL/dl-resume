/**
 * /api/questions/[id] —— 收藏切换 + 删单题。
 *
 * 设计文档 §7:PATCH { starred } → 收藏切换;DELETE → 删单题。
 *
 * 收藏是**幂等**的:传目标状态而不是「翻转」,所以重复设同一个值也照样 200。
 *
 * 一条硬规则:只改得动自己的题 —— 仓储层按 userId 过滤,这里把 session.sub 传下去。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { deleteQuestionItem, setQuestionStar } from "@/lib/interview/repo";
import { serializeItem } from "@/lib/interview/serialize";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  /** 目标收藏状态 —— 幂等开关 */
  starred: z.boolean(),
});

/**
 * 题目不存在(404)还是别人的题(403)?
 *
 * 仓储层对这两种情况都返回 null —— 它只按 userId 过滤,不区分「没这题」和
 * 「这题是别人的」。这里补一次**只读**探测把两者分开:只取 userId,不取内容,
 * 别人的题目一个字都不会泄出去。
 */
async function rejectMissing(id: string, userId: string) {
  const owner = await prisma.questionItem.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (owner && owner.userId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/**
 * PATCH /api/questions/[id] —— 收藏 / 取消收藏。
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await setQuestionStar(id, session.sub, parsed.data.starred);
  if (!row) return rejectMissing(id, session.sub);

  return NextResponse.json({ item: serializeItem(row) });
}

/**
 * DELETE /api/questions/[id] —— 删掉这道题。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const ok = await deleteQuestionItem(id, session.sub);
  if (!ok) return rejectMissing(id, session.sub);

  return NextResponse.json({ ok: true });
}
