/**
 * 题库分组仓储层 —— Prisma 的薄封装(照 repo.ts 的范式)。
 *
 * 题库是**用户自建的命名分组**,一层套在「套」上面:
 *   题库(用户建的,如「字节跳动」) › 套(一次押题) › 题(一道道题)
 *
 * 两条硬规则:
 *  1. 一切读写都按 userId 隔离 —— 题库不共享,跨用户不可见。
 *  2. 题库名在同一个用户下唯一 —— 数据库有 (userId, name) 唯一约束,
 *     这里把它翻译成业务错误 DuplicateCollectionNameError 抛给调用方。
 *
 * 题库只是**分组视图**,不是去重边界:一道题在一个用户下仍然只有一份
 * (QuestionItem 上的 (userId, fingerprint) 唯一索引没动)。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/** 题库行 */
export type QuestionCollectionRow = {
  id: string;
  userId: string;
  /** 题库名 */
  name: string;
  /** 系统兜底题库:用户一个题库都没有时自动建,不可删 */
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** 系统兜底题库的名字 */
export const DEFAULT_COLLECTION_NAME = "默认题库";

/** 题库重名 —— 数据库唯一约束冲突翻译成的业务错误 */
export class DuplicateCollectionNameError extends Error {
  constructor(name: string) {
    super(`已经有同名题库了:${name}`);
    this.name = "DuplicateCollectionNameError";
  }
}

/** 判断是否 Prisma 的唯一约束冲突(P2002) */
function isUniqueConstraintViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/**
 * 列出该用户的题库(按最近更新倒序)。
 *
 * 倒序而不是建库时间倒序:用户刚改过名的题库是他现在最关心的那个,
 * 下拉框里应该排最前。
 */
export async function listCollectionsByUser(
  userId: string,
): Promise<QuestionCollectionRow[]> {
  return prisma.questionCollection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * 建一个题库。
 *
 * 重名抛 DuplicateCollectionNameError —— 不静默建出第二个同名库,
 * 那会让用户在题库页看到两个一模一样的东西,分不清哪个是哪个。
 */
export async function createCollection(
  userId: string,
  name: string,
  isDefault = false,
): Promise<QuestionCollectionRow> {
  try {
    return await prisma.questionCollection.create({
      data: { userId, name, isDefault },
    });
  } catch (e) {
    if (isUniqueConstraintViolation(e)) throw new DuplicateCollectionNameError(name);
    throw e;
  }
}

/**
 * 重命名题库。
 *
 * 返回 null 表示题库不存在或不属于该用户(别人的库改不得)。
 * 重名抛 DuplicateCollectionNameError。
 */
export async function renameCollection(
  id: string,
  userId: string,
  name: string,
): Promise<QuestionCollectionRow | null> {
  try {
    const { count } = await prisma.questionCollection.updateMany({
      where: { id, userId },
      data: { name },
    });
    if (count === 0) return null;
    return prisma.questionCollection.findFirst({ where: { id, userId } });
  } catch (e) {
    if (isUniqueConstraintViolation(e)) throw new DuplicateCollectionNameError(name);
    throw e;
  }
}

/**
 * 删题库:里面的套与题一起没。
 *
 * 返回 null 表示题库不存在、不属于该用户,或者它是系统兜底的默认题库 ——
 * 默认题库是用户的救命绳(历史套都落在那儿),删了就无处可去。
 *
 * 先删题再删套再删库:显式删一次,行为不依赖 FK 级联在当前连接上是否生效。
 */
export async function deleteCollection(
  id: string,
  userId: string,
): Promise<{ deletedSets: number; deletedQuestions: number } | null> {
  const collection = await prisma.questionCollection.findFirst({
    where: { id, userId },
  });
  if (!collection) return null;
  if (collection.isDefault) return null;

  const sets = await prisma.questionSet.findMany({
    where: { userId, collectionId: id },
    select: { id: true },
  });

  let deletedQuestions = 0;
  for (const set of sets) {
    const { count } = await prisma.questionItem.deleteMany({
      where: { userId, setId: set.id },
    });
    deletedQuestions += count;
  }

  const { count: deletedSets } = await prisma.questionSet.deleteMany({
    where: { userId, collectionId: id },
  });
  await prisma.questionCollection.deleteMany({ where: { id, userId } });

  return { deletedSets, deletedQuestions };
}

/**
 * 这一套题该进哪个库。
 *
 * 有题库就用最近更新的那个 —— 用户刚动过的库最可能是他想去的那一个。
 * 一个都没有就建一个「默认题库」兜底:他连题库都还没建,总得有个落点,
 * 不然第一次押题的结果就无处可去。
 */
export async function resolveTargetCollection(
  userId: string,
): Promise<QuestionCollectionRow> {
  const existing = await listCollectionsByUser(userId);
  if (existing.length > 0) return existing[0];
  return createCollection(userId, DEFAULT_COLLECTION_NAME, true);
}

/**
 * 按 id 取一个题库(带用户隔离)。
 *
 * 返回 null 表示不存在或不属于该用户 —— 调用方据此回 404 / 403。
 */
export async function getCollection(
  id: string,
  userId: string,
): Promise<QuestionCollectionRow | null> {
  return prisma.questionCollection.findFirst({ where: { id, userId } });
}

/** 某个题库里有多少套、多少道题 —— 题库块头要显示 */
export interface CollectionCounts {
  setCount: number;
  questionCount: number;
}

/**
 * 数一个题库里有几套、几道题。
 *
 * 用 include 一次把套和题都取回来在内存里数 —— 题量级是几百,一次查询
 * 比两条 count 查询省事,也不会出现两次查询之间数据变了导致数对不上。
 */
export async function countCollectionContents(
  id: string,
  userId: string,
): Promise<CollectionCounts> {
  const collection = await prisma.questionCollection.findFirst({
    where: { id, userId },
    include: {
      sets: {
        select: {
          _count: { select: { items: true } },
        },
      },
    },
  });
  if (!collection) return { setCount: 0, questionCount: 0 };

  let questionCount = 0;
  for (const set of collection.sets) questionCount += set._count.items;
  return { setCount: collection.sets.length, questionCount };
}

/** 过滤条件:题库维度 */
export interface CollectionFilter {
  /** 取某一个题库 */
  collectionId?: string;
}

/** 把筛选条件翻译成 Prisma 的 where */
export function buildCollectionWhere(
  userId: string,
  filter: CollectionFilter = {},
): Prisma.QuestionCollectionWhereInput {
  const where: Prisma.QuestionCollectionWhereInput = { userId };
  if (filter.collectionId !== undefined) where.id = filter.collectionId;
  return where;
}
