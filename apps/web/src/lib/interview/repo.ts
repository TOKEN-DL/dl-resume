/**
 * 面试题库仓储层 —— Prisma 的薄封装(照 resume-repo.ts 的范式)
 * 见 issue #17;设计文档 §3 数据模型、§4 去重机制
 *
 * 两条硬规则:
 *  1. 一切读写都按 userId 隔离 —— 题库不共享,跨用户不可见。
 *  2. (userId, fingerprint) 唯一索引是「同一道题只存一份」的数据库级保险:
 *     写入撞约束时**跳过该题并计入重复数**,不抛错。
 *
 * 行类型在这里自己声明,不依赖 #15 的领域类型文件 —— 仓储层是更底层的一层。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/** 题库套行(一次押题 = 一套) */
export type QuestionSetRow = {
  id: string;
  userId: string;
  /** 来源简历。存字符串不建外键:简历被删了题还在 */
  resumeId: string | null;
  resumeTitle: string;
  /** 生成引擎:minimax / local */
  provider: string;
  createdAt: Date;
  updatedAt: Date;
};

/** 题库条目行(一道题) */
export type QuestionItemRow = {
  id: string;
  userId: string;
  setId: string;
  /** 来源简历。存字符串不建外键:简历被删了题还在 */
  resumeId: string | null;
  resumeTitle: string;
  /** 题干 */
  question: string;
  /** 参考答案 */
  answer: string;
  /** 考点关键词 */
  topic: string;
  /** basic | deep */
  category: string;
  /** 1-4,对应四档难度 */
  difficulty: number;
  /** 归一化指纹,查重用 */
  fingerprint: string;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** 写入一道题 */
export interface CreateQuestionItemInput {
  question: string;
  answer: string;
  topic: string;
  /** basic | deep */
  category: string;
  /** 1-4 */
  difficulty: number;
  /** 归一化指纹,由调用方算好 */
  fingerprint: string;
  starred?: boolean;
}

/** 写入一整套 */
export interface SaveQuestionSetInput {
  userId: string;
  resumeId?: string | null;
  resumeTitle: string;
  /** 生成引擎:minimax / local */
  provider: string;
  items: CreateQuestionItemInput[];
}

/** 写入结果:实际入库的题 + 被跳过的重复题 */
export interface SaveQuestionSetResult {
  set: QuestionSetRow;
  /** 实际写入的题目 */
  inserted: QuestionItemRow[];
  /** 命中 (userId, fingerprint) 唯一约束被跳过的题目数 */
  skipped: number;
}

/** 题库筛选条件(对应设计文档 §7 的查询参数) */
export interface QuestionFilter {
  /** 取某一整套 */
  setId?: string;
  /** 按来源简历筛选 */
  resumeId?: string;
  /** basic | deep */
  category?: string;
  /** 1-4 */
  difficulty?: number;
  starred?: boolean;
  /** 关键词,匹配题干 / 答案 / 考点 */
  q?: string;
  /** 分页:条数上限 */
  limit?: number;
  /** 分页:偏移 */
  offset?: number;
}

/**
 * 判断是否 Prisma 的唯一约束冲突(P2002)。
 *
 * QuestionItem 上只有一条业务唯一索引(userId, fingerprint),
 * 所以 P2002 必然来自它 —— 直接当「重复题」处理即可。
 */
function isUniqueConstraintViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/** 把筛选条件翻译成 Prisma 的 where */
function buildItemWhere(
  userId: string,
  filter: QuestionFilter = {},
): Prisma.QuestionItemWhereInput {
  const where: Prisma.QuestionItemWhereInput = { userId };
  if (filter.setId !== undefined) where.setId = filter.setId;
  if (filter.resumeId !== undefined) where.resumeId = filter.resumeId;
  if (filter.category !== undefined) where.category = filter.category;
  if (filter.difficulty !== undefined) where.difficulty = filter.difficulty;
  if (filter.starred !== undefined) where.starred = filter.starred;
  if (filter.q) {
    where.OR = [
      { question: { contains: filter.q } },
      { answer: { contains: filter.q } },
      { topic: { contains: filter.q } },
    ];
  }
  return where;
}

/**
 * 写入一整套题:先建套,再逐题落库。
 *
 * 逐题插入而不是批量 insert,是因为唯一约束撞了要**跳过该题**而不是让整批回滚 ——
 * 题目在套里各自独立,一道重复不影响其余的题入库。
 *
 * 注意:整套全部重复时,会留下一个空套。是否整套不入库是业务策略(套级判重 ≥55% 拦截),
 * 属于调用方(#18)的职责,本层不替它做决定;调用方要清掉就再调 deleteQuestionSet。
 */
export async function saveQuestionSet(
  input: SaveQuestionSetInput,
): Promise<SaveQuestionSetResult> {
  const set = await prisma.questionSet.create({
    data: {
      userId: input.userId,
      resumeId: input.resumeId ?? null,
      resumeTitle: input.resumeTitle,
      provider: input.provider,
    },
  });

  const inserted: QuestionItemRow[] = [];
  let skipped = 0;
  for (const item of input.items) {
    try {
      const row = await prisma.questionItem.create({
        data: {
          userId: input.userId,
          setId: set.id,
          resumeId: input.resumeId ?? null,
          resumeTitle: input.resumeTitle,
          question: item.question,
          answer: item.answer,
          topic: item.topic,
          category: item.category,
          difficulty: item.difficulty,
          fingerprint: item.fingerprint,
          starred: item.starred ?? false,
        },
      });
      inserted.push(row);
    } catch (e) {
      // 命中 (userId, fingerprint) 唯一约束 = 库里已经有这道题了 → 跳过、计重复数
      if (isUniqueConstraintViolation(e)) {
        skipped += 1;
        continue;
      }
      throw e;
    }
  }
  return { set, inserted, skipped };
}

/** 列出该用户的全套(按创建时间倒序) */
export async function listQuestionSetsByUser(userId: string): Promise<QuestionSetRow[]> {
  return prisma.questionSet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/** 按条件列出题目(按用户隔离,创建时间倒序) */
export async function listQuestionItems(
  userId: string,
  filter: QuestionFilter = {},
): Promise<QuestionItemRow[]> {
  const args: Prisma.QuestionItemFindManyArgs = {
    where: buildItemWhere(userId, filter),
    orderBy: { createdAt: "desc" },
  };
  if (filter.limit !== undefined) args.take = filter.limit;
  if (filter.offset !== undefined) args.skip = filter.offset;
  return prisma.questionItem.findMany(args);
}

/** 按条件统计题目总数(分页用,忽略 limit / offset) */
export async function countQuestionItems(
  userId: string,
  filter: QuestionFilter = {},
): Promise<number> {
  return prisma.questionItem.count({ where: buildItemWhere(userId, filter) });
}

/**
 * 收藏切换:传**目标状态**而不是「翻转」,所以重复设置同一个值是幂等的。
 *
 * 返回 null 表示题目不存在或不属于该用户 —— 调用方据此回 404 / 403。
 */
export async function setQuestionStar(
  id: string,
  userId: string,
  starred: boolean,
): Promise<QuestionItemRow | null> {
  const { count } = await prisma.questionItem.updateMany({
    where: { id, userId },
    data: { starred },
  });
  if (count === 0) return null;
  return prisma.questionItem.findFirst({ where: { id, userId } });
}

/**
 * 删除单题。
 * 返回 false 表示题目不存在或不属于该用户(别人的题删不掉)。
 */
export async function deleteQuestionItem(id: string, userId: string): Promise<boolean> {
  const { count } = await prisma.questionItem.deleteMany({ where: { id, userId } });
  return count > 0;
}

/**
 * 删除整套(连同套里的题)。
 *
 * 先删题再删套:显式删一次,行为不依赖 FK 级联在当前连接上是否生效。
 * 返回 false 表示套不存在或不属于该用户。
 */
export async function deleteQuestionSet(setId: string, userId: string): Promise<boolean> {
  await prisma.questionItem.deleteMany({ where: { setId, userId } });
  const { count } = await prisma.questionSet.deleteMany({ where: { id: setId, userId } });
  return count > 0;
}
