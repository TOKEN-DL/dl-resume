/**
 * /api/question-collections —— 题库(用户自建的分组)的列表与新建。
 *
 *   GET   列出该用户的题库,每个库带「几套几题」(题库块头要显示)
 *   POST  新建一个题库
 *
 * 一条硬规则:**一切读写都按 session.sub 过滤** —— 题库不共享,跨用户不可见。
 * 仓储层(listCollectionsByUser / createCollection)把 userId 作为必传参数收下,
 * 这里只负责把 session.sub 原样传下去,不绕过。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  DuplicateCollectionNameError,
  createCollection,
  listCollectionsByUser,
} from "@/lib/interview/collections-repo";
import { listQuestionSetsByUserWithCounts } from "@/lib/interview/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 新建题库的请求体 */
const createSchema = z.object({
  /** 题库名。空名字没意义 —— 400。 */
  name: z.string().trim().min(1, "题库名不能为空").max(40, "题库名太长了"),
});

/**
 * GET /api/question-collections —— 题库列表。
 *
 * 套与题数从**未筛选**的套列表里统计 —— 块头显示的是「这个库里到底有多少」,
 * 不是「当前筛选命中了多少」。筛选命中数在展开之后看得到。
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [collections, sets] = await Promise.all([
    listCollectionsByUser(session.sub),
    listQuestionSetsByUserWithCounts(session.sub),
  ]);

  // 每个库几套几题
  const setCount = new Map<string, number>();
  const questionCount = new Map<string, number>();
  for (const set of sets) {
    setCount.set(set.collectionId, (setCount.get(set.collectionId) ?? 0) + 1);
    questionCount.set(
      set.collectionId,
      (questionCount.get(set.collectionId) ?? 0) + set.itemCount,
    );
  }

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      isDefault: c.isDefault,
      setCount: setCount.get(c.id) ?? 0,
      questionCount: questionCount.get(c.id) ?? 0,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/question-collections —— 新建题库。
 *
 * 重名报 409 而不是静默建出第二个同名库 —— 页面上两个一模一样的名字,
 * 用户分不清哪个是哪个。
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const collection = await createCollection(session.sub, parsed.data.name);
    return NextResponse.json(
      {
        collection: {
          id: collection.id,
          name: collection.name,
          isDefault: collection.isDefault,
          setCount: 0,
          questionCount: 0,
          createdAt: collection.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DuplicateCollectionNameError) {
      return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    }
    throw e;
  }
}
