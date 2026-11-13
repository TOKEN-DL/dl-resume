/**
 * /api/question-collections/[id] —— 重命名与删除题库。
 *
 *   PATCH  { name } → 改题库名
 *   DELETE          → 删题库(连同里面的套和题)
 *
 * 一条硬规则:**一切读写都按 session.sub 过滤** —— 题库不共享,跨用户不可见。
 *
 * 三个错误码要分得开,不然用户改了没反应也不知道原因:
 *   403 别人的题库
 *   404 没这个题库
 *   409 重名 / 删的是默认题库
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  DuplicateCollectionNameError,
  deleteCollection,
  getCollection,
  renameCollection,
} from "@/lib/interview/collections-repo";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 重命名的请求体 */
const renameSchema = z.object({
  /** 题库名。空名字没意义 —— 400。 */
  name: z.string().trim().min(1, "题库名不能为空").max(40, "题库名太长了"),
});

/**
 * 题库不存在(404)还是别人的题库(403)?
 *
 * 仓储层对这两种情况都返回 null —— 它只按 userId 过滤,不区分「没这个库」和
 * 「这个库是别人的」。这里补一次**只读**探测把两者分开:只取 userId,不取内容,
 * 别人的题库一个字都不会泄出去。
 */
async function rejectMissing(id: string, userId: string) {
  const owner = await prisma.questionCollection.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (owner && owner.userId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/**
 * PATCH /api/question-collections/[id] —— 重命名题库。
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

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await renameCollection(id, session.sub, parsed.data.name);
    if (!row) return rejectMissing(id, session.sub);

    return NextResponse.json({
      collection: {
        id: row.id,
        name: row.name,
        isDefault: row.isDefault,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    // 重名:页面上两个一模一样的名字,用户分不清哪个是哪个
    if (e instanceof DuplicateCollectionNameError) {
      return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    }
    throw e;
  }
}

/**
 * DELETE /api/question-collections/[id] —— 删题库,里面的套和题一起没。
 *
 * 默认题库删不掉:它是用户的救命绳(历史套都落在那儿),删了就无处可去。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const collection = await getCollection(id, session.sub);
  if (!collection) return rejectMissing(id, session.sub);

  if (collection.isDefault) {
    return NextResponse.json({ error: "default_collection" }, { status: 409 });
  }

  const result = await deleteCollection(id, session.sub);
  if (!result) return rejectMissing(id, session.sub);

  // 报清楚删了几套几题,用户好确认自己删掉的是不是想要的东西
  return NextResponse.json({
    deletedSets: result.deletedSets,
    deletedQuestions: result.deletedQuestions,
  });
}
