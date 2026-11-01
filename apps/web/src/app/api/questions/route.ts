/**
 * /api/questions —— 我的题库列表 + 删整套。
 *
 * 设计文档 §7 的契约:GET → { items, total, sets };DELETE ?setId=… → 删整套。
 *
 * 一条硬规则:**一切读写都按 session.sub 过滤** —— 题库不共享,跨用户不可见。
 * 仓储层(listQuestionItems / deleteQuestionSet…)把 userId 作为必传参数收下,
 * 这里只负责把 session.sub 原样传下去,不绕过。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  countQuestionItems,
  deleteQuestionSet,
  listQuestionItems,
  listQuestionSetsByUser,
} from "@/lib/interview/repo";
import { serializeItem } from "@/lib/interview/serialize";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 查询参数(设计文档 §7)。
 *
 * 空字符串一律当作「没传」—— ?q= 这种手滑不该报 400。
 */
const filterSchema = z.object({
  /** 取某一整套 */
  setId: z.string().trim().min(1).optional(),
  /** 按来源简历筛选 */
  resumeId: z.string().trim().min(1).optional(),
  /** basic / deep */
  category: z.enum(["basic", "deep"]).optional(),
  /** 1~4 */
  difficulty: z.coerce.number().int().min(1).max(4).optional(),
  /** true / false */
  starred: z.enum(["true", "false"]).optional(),
  /** 关键词:匹配题干 / 答案 / 考点 */
  q: z.string().trim().min(1).optional(),
});

/** 允许出现在查询串里的参数名 */
const FILTER_KEYS = ["setId", "resumeId", "category", "difficulty", "starred", "q"] as const;

/** 删整套的参数 */
const deleteSetSchema = z.object({
  setId: z.string().trim().min(1),
});

/** 读查询串,丢掉空值 */
function readFilters(url: URL): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null && value.trim() !== "") raw[key] = value;
  }
  return raw;
}

/**
 * GET /api/questions —— 题库列表。
 *
 * 返回三段:
 *   - items:命中筛选的题目
 *   - total:命中筛选的题目总数(分页用)
 *   - sets:按批次分组的组信息,带 count(组头要显示题数)
 *
 * sets 只包含**有命中题目**的套 —— 题都删光的组不占位置。
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = filterSchema.safeParse(readFilters(url));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { starred, ...rest } = parsed.data;
  const filter = {
    ...rest,
    ...(starred === undefined ? {} : { starred: starred === "true" }),
  };

  const [items, total, allSets] = await Promise.all([
    listQuestionItems(session.sub, filter),
    countQuestionItems(session.sub, filter),
    listQuestionSetsByUser(session.sub),
  ]);

  // 组头题数 = 这一套里命中筛选的题数(跟下面实际渲染的卡片数一致)
  const countBySet = new Map<string, number>();
  for (const item of items) {
    countBySet.set(item.setId, (countBySet.get(item.setId) ?? 0) + 1);
  }

  const sets = allSets
    .filter((s) => (countBySet.get(s.id) ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      resumeId: s.resumeId,
      resumeTitle: s.resumeTitle,
      provider: s.provider,
      createdAt: s.createdAt.toISOString(),
      count: countBySet.get(s.id) ?? 0,
    }));

  return NextResponse.json({ items: items.map(serializeItem), total, sets });
}

/**
 * DELETE /api/questions?setId=… —— 删掉整套(含套里的题)。
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = deleteSetSchema.safeParse({ setId: url.searchParams.get("setId") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { setId } = parsed.data;
  const ok = await deleteQuestionSet(setId, session.sub);
  if (!ok) {
    // 仓储层把「不存在」和「不属于该用户」都返回 false —— 用一次只读探测区分
    // 403 / 404。只读 userId,不读内容,不会泄漏别人的数据。
    const owner = await prisma.questionSet.findUnique({
      where: { id: setId },
      select: { userId: true },
    });
    if (owner && owner.userId !== session.sub) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
