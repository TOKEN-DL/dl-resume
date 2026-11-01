/**
 * 面试题库仓储层单测 —— issue #17
 * TDD:先写测试,再实现。
 * 用 mock Prisma(照 resume-repo.test.ts 的写法),不真连数据库。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";

interface QuestionSetRow {
  id: string;
  userId: string;
  resumeId: string | null;
  resumeTitle: string;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

interface QuestionItemRow {
  id: string;
  userId: string;
  setId: string;
  resumeId: string | null;
  resumeTitle: string;
  question: string;
  answer: string;
  topic: string;
  category: string;
  difficulty: number;
  fingerprint: string;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** 写入用的一行题目(字段与仓储层的写入入参一致) */
type QuestionItemDraft = {
  question: string;
  answer: string;
  topic: string;
  category: string;
  difficulty: number;
  fingerprint: string;
  starred: boolean;
};

// mock store
const sets = new Map<string, QuestionSetRow>();
const items = new Map<string, QuestionItemRow>();
let idSeq = 1;
let tick = 0;
const newId = (prefix: string) => `${prefix}_${(idSeq++).toString().padStart(4, "0")}`;
/** 单调递增的时间戳 —— 保证 createdAt 排序在测试里是稳定的 */
const now = () => new Date(1_700_000_000_000 + tick++ * 1000);

/** 复刻 Prisma 的唯一约束冲突错误 P2002 */
const prismaUniqueViolation = (): Error & { code: "P2002"; meta: { target: string[] } } => {
  const err = new Error(
    "Unique constraint failed on the fields: (`userId`,`fingerprint`)",
  ) as Error & { code: "P2002"; meta: { target: string[] } };
  err.code = "P2002";
  err.meta = { target: ["userId", "fingerprint"] };
  return err;
};

/** mock 里的 where 形状(只覆盖仓储层实际用到的字段) */
interface ItemWhere {
  id?: string;
  userId?: string;
  setId?: string;
  resumeId?: string | null;
  category?: string;
  difficulty?: number;
  starred?: boolean;
  OR?: Array<Record<string, { contains: string }>>;
}

function matchesItem(row: QuestionItemRow, where: ItemWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.setId !== undefined && row.setId !== where.setId) return false;
  if (where.resumeId !== undefined && row.resumeId !== where.resumeId) return false;
  if (where.category !== undefined && row.category !== where.category) return false;
  if (where.difficulty !== undefined && row.difficulty !== where.difficulty) return false;
  if (where.starred !== undefined && row.starred !== where.starred) return false;
  if (where.OR && where.OR.length > 0) {
    const hit = where.OR.some((cond) =>
      Object.entries(cond).some(([field, spec]) =>
        String((row as unknown as Record<string, unknown>)[field] ?? "").includes(
          spec.contains,
        ),
      ),
    );
    if (!hit) return false;
  }
  return true;
}

vi.mock("../prisma", () => ({
  prisma: {
    questionSet: {
      create: vi.fn(async (args: Prisma.QuestionSetCreateArgs) => {
        const d = args.data as {
          userId: string;
          resumeId?: string | null;
          resumeTitle: string;
          provider: string;
        };
        const row: QuestionSetRow = {
          id: newId("qs"),
          userId: d.userId,
          resumeId: d.resumeId ?? null,
          resumeTitle: d.resumeTitle,
          provider: d.provider,
          createdAt: now(),
          updatedAt: now(),
        };
        sets.set(row.id, row);
        return row;
      }),
      findMany: vi.fn(async (args: Prisma.QuestionSetFindManyArgs) => {
        const where = args.where as { userId?: string } | undefined;
        const all = Array.from(sets.values()).filter(
          (s) => !where?.userId || s.userId === where.userId,
        );
        all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return all;
      }),
      deleteMany: vi.fn(async (args: Prisma.QuestionSetDeleteManyArgs) => {
        const where = args.where as { id?: string; userId?: string };
        let count = 0;
        for (const [id, s] of Array.from(sets.entries())) {
          if (where.id !== undefined && s.id !== where.id) continue;
          if (where.userId !== undefined && s.userId !== where.userId) continue;
          sets.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    questionItem: {
      create: vi.fn(async (args: Prisma.QuestionItemCreateArgs) => {
        const d = args.data as {
          userId: string;
          setId: string;
          resumeId?: string | null;
          resumeTitle: string;
          question: string;
          answer: string;
          topic: string;
          category: string;
          difficulty: number;
          fingerprint: string;
          starred?: boolean;
        };
        // 数据库级保险:(userId, fingerprint) 唯一 —— 撞了就抛 P2002
        for (const row of items.values()) {
          if (row.userId === d.userId && row.fingerprint === d.fingerprint) {
            throw prismaUniqueViolation();
          }
        }
        const row: QuestionItemRow = {
          id: newId("qi"),
          userId: d.userId,
          setId: d.setId,
          resumeId: d.resumeId ?? null,
          resumeTitle: d.resumeTitle,
          question: d.question,
          answer: d.answer,
          topic: d.topic,
          category: d.category,
          difficulty: d.difficulty,
          fingerprint: d.fingerprint,
          starred: d.starred ?? false,
          createdAt: now(),
          updatedAt: now(),
        };
        items.set(row.id, row);
        return row;
      }),
      findMany: vi.fn(async (args: Prisma.QuestionItemFindManyArgs) => {
        const where = args.where as ItemWhere | undefined;
        const orderBy = args.orderBy as { createdAt?: "asc" | "desc" } | undefined;
        let all = Array.from(items.values()).filter((r) => !where || matchesItem(r, where));
        if (orderBy?.createdAt === "desc") {
          all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (args.skip) all = all.slice(args.skip);
        if (args.take) all = all.slice(0, args.take);
        return all;
      }),
      findFirst: vi.fn(async (args: Prisma.QuestionItemFindFirstArgs) => {
        const where = args.where as ItemWhere | undefined;
        return (
          Array.from(items.values()).find((r) => !where || matchesItem(r, where)) ?? null
        );
      }),
      count: vi.fn(async (args: Prisma.QuestionItemCountArgs) => {
        const where = args.where as ItemWhere | undefined;
        return Array.from(items.values()).filter((r) => !where || matchesItem(r, where)).length;
      }),
      updateMany: vi.fn(async (args: Prisma.QuestionItemUpdateManyArgs) => {
        const where = args.where as ItemWhere | undefined;
        const patch = args.data as { starred?: boolean };
        let count = 0;
        for (const row of items.values()) {
          if (where && !matchesItem(row, where)) continue;
          if (patch.starred !== undefined) row.starred = patch.starred;
          row.updatedAt = now();
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async (args: Prisma.QuestionItemDeleteManyArgs) => {
        const where = args.where as ItemWhere | undefined;
        let count = 0;
        for (const [id, row] of Array.from(items.entries())) {
          if (where && !matchesItem(row, where)) continue;
          items.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
  },
}));

import {
  saveQuestionSet,
  listQuestionSetsByUser,
  listQuestionItems,
  countQuestionItems,
  setQuestionStar,
  deleteQuestionItem,
  deleteQuestionSet,
} from "./repo";
import { prisma } from "../prisma";

beforeEach(() => {
  sets.clear();
  items.clear();
  idSeq = 1;
  tick = 0;
});

/** 造一道题 */
const draft = (overrides: Partial<QuestionItemDraft> = {}): QuestionItemDraft => ({
  question: "介绍一下 RAG 的召回策略",
  answer: "向量检索 + 关键词检索混合召回。",
  topic: "RAG 召回策略",
  category: "basic",
  difficulty: 2,
  fingerprint: "fp_default",
  starred: false,
  ...overrides,
});

/** 造一套题(overrides 落在**套**上,不是题上) */
const setDraft = (
  overrides: {
    userId?: string;
    resumeId?: string | null;
    resumeTitle?: string;
    provider?: string;
    items?: QuestionItemDraft[];
  } = {},
) => ({
  userId: "u1",
  resumeId: "res_1",
  resumeTitle: "后端简历",
  provider: "minimax",
  items: [draft()],
  ...overrides,
});

describe("saveQuestionSet", () => {
  it("写入整套:建套 + 落所有题目", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      items: [
        draft({ fingerprint: "fp_a" }),
        draft({ fingerprint: "fp_b" }),
        draft({ fingerprint: "fp_c" }),
      ],
    });
    expect(res.skipped).toBe(0);
    expect(res.inserted).toHaveLength(3);
    expect(res.set.userId).toBe("u1");
    expect(res.set.resumeTitle).toBe("后端简历");
    expect(res.set.provider).toBe("minimax");
    // 题目都挂在这一套下
    expect(res.inserted.every((i) => i.setId === res.set.id)).toBe(true);
    expect(res.inserted.every((i) => i.userId === "u1")).toBe(true);
  });

  it("同一套里 fingerprint 相同的题:后者被跳过并计入重复数,不抛错", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      items: [
        draft({ fingerprint: "fp_same", question: "A" }),
        draft({ fingerprint: "fp_same", question: "B" }),
      ],
    });
    expect(res.inserted).toHaveLength(1);
    expect(res.skipped).toBe(1);
    expect(res.inserted[0].question).toBe("A");
  });

  it("跨套重复:库里已有的 fingerprint 被跳过并计入重复数", async () => {
    await saveQuestionSet({ ...setDraft(), items: [draft({ fingerprint: "fp_x" })] });
    const second = await saveQuestionSet({
      ...setDraft(),
      items: [draft({ fingerprint: "fp_x" }), draft({ fingerprint: "fp_y" })],
    });
    expect(second.inserted).toHaveLength(1);
    expect(second.inserted[0].fingerprint).toBe("fp_y");
    expect(second.skipped).toBe(1);
  });

  it("唯一性按用户隔离:别的用户同 fingerprint 照常写入", async () => {
    await saveQuestionSet({ ...setDraft(), items: [draft({ fingerprint: "fp_shared" })] });
    const other = await saveQuestionSet({
      ...setDraft({ userId: "u2" }),
      items: [draft({ fingerprint: "fp_shared" })],
    });
    expect(other.skipped).toBe(0);
    expect(other.inserted).toHaveLength(1);
  });

  it("保留写入时的收藏状态", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      items: [draft({ fingerprint: "fp_s", starred: true })],
    });
    expect(res.inserted[0].starred).toBe(true);
  });

  it("没有来源简历时 resumeId 存 null", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      resumeId: undefined,
      items: [draft()],
    });
    expect(res.set.resumeId).toBeNull();
    expect(res.inserted[0].resumeId).toBeNull();
  });

  it("非唯一约束错误原样抛出(不被当成重复吞掉)", async () => {
    vi.mocked(prisma.questionItem.create).mockRejectedValueOnce(new Error("db down"));
    await expect(saveQuestionSet(setDraft())).rejects.toThrow("db down");
  });
});

describe("listQuestionSetsByUser", () => {
  it("只返回该用户的套", async () => {
    await saveQuestionSet({ ...setDraft({ userId: "u1" }) });
    await saveQuestionSet({ ...setDraft({ userId: "u2" }) });
    await saveQuestionSet({ ...setDraft({ userId: "u1" }) });
    const list = await listQuestionSetsByUser("u1");
    expect(list).toHaveLength(2);
    expect(list.every((s) => s.userId === "u1")).toBe(true);
  });

  it("按 createdAt 倒序(最新在前)", async () => {
    await saveQuestionSet(setDraft());
    await saveQuestionSet(setDraft());
    await saveQuestionSet(setDraft());
    const list = await listQuestionSetsByUser("u1");
    expect(list[0].createdAt.getTime()).toBeGreaterThan(list[2].createdAt.getTime());
  });

  it("用户没有套时返回空数组", async () => {
    expect(await listQuestionSetsByUser("u1")).toEqual([]);
  });
});

describe("listQuestionItems", () => {
  /** 铺一批数据:u1 三道题 + u2 一道题 */
  async function seed() {
    const s1 = await saveQuestionSet({
      ...setDraft({ resumeId: "res_1" }),
      items: [
        draft({ fingerprint: "fp_1", category: "basic", difficulty: 1, topic: "召回" }),
        draft({ fingerprint: "fp_2", category: "deep", difficulty: 3, topic: "重排" }),
        draft({ fingerprint: "fp_3", category: "deep", difficulty: 4, topic: "评估" }),
      ],
    });
    const s2 = await saveQuestionSet({
      ...setDraft({ resumeId: "res_2" }),
      items: [
        draft({
          fingerprint: "fp_4",
          question: "讲讲向量索引的原理",
          answer: "HNSW 索引的原理。",
        }),
      ],
    });
    await saveQuestionSet({
      ...setDraft({ userId: "u2" }),
      items: [draft({ fingerprint: "fp_9" })],
    });
    return { s1, s2 };
  }

  it("按用户隔离:跨用户不可见", async () => {
    await seed();
    const list = await listQuestionItems("u1");
    expect(list).toHaveLength(4);
    expect(list.every((i) => i.userId === "u1")).toBe(true);
  });

  it("按 setId 取某一整套", async () => {
    const { s1 } = await seed();
    const list = await listQuestionItems("u1", { setId: s1.set.id });
    expect(list).toHaveLength(3);
    expect(list.every((i) => i.setId === s1.set.id)).toBe(true);
  });

  it("按来源简历筛选", async () => {
    await seed();
    expect(await listQuestionItems("u1", { resumeId: "res_2" })).toHaveLength(1);
    expect(await listQuestionItems("u1", { resumeId: "res_1" })).toHaveLength(3);
  });

  it("按分类筛选", async () => {
    await seed();
    const deep = await listQuestionItems("u1", { category: "deep" });
    expect(deep).toHaveLength(2);
    expect(deep.every((i) => i.category === "deep")).toBe(true);
  });

  it("按难度筛选", async () => {
    await seed();
    const list = await listQuestionItems("u1", { difficulty: 3 });
    expect(list).toHaveLength(1);
    expect(list[0].difficulty).toBe(3);
  });

  it("按收藏筛选", async () => {
    const s = await saveQuestionSet({
      ...setDraft(),
      items: [
        draft({ fingerprint: "fp_st1", starred: true }),
        draft({ fingerprint: "fp_st2", starred: false }),
      ],
    });
    expect(s.inserted).toHaveLength(2);
    const starred = await listQuestionItems("u1", { starred: true });
    expect(starred).toHaveLength(1);
    expect(starred[0].starred).toBe(true);
    expect(await listQuestionItems("u1", { starred: false })).toHaveLength(1);
  });

  it("关键词 q 匹配题干 / 答案 / 考点", async () => {
    await seed();
    expect(await listQuestionItems("u1", { q: "向量索引" })).toHaveLength(1);
    expect(await listQuestionItems("u1", { q: "重排" })).toHaveLength(1);
    expect(await listQuestionItems("u1", { q: "混合召回" })).toHaveLength(3);
    expect(await listQuestionItems("u1", { q: "不存在的词" })).toHaveLength(0);
  });

  it("组合条件筛选", async () => {
    await seed();
    const list = await listQuestionItems("u1", { category: "deep", difficulty: 4 });
    expect(list).toHaveLength(1);
    expect(list[0].topic).toBe("评估");
  });

  it("分页:limit / offset", async () => {
    await seed();
    const page1 = await listQuestionItems("u1", { limit: 2 });
    const page2 = await listQuestionItems("u1", { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    const overlap = page1.filter((a) => page2.some((b) => b.id === a.id));
    expect(overlap).toHaveLength(0);
  });
});

describe("countQuestionItems", () => {
  it("统计命中筛选条件的题目数", async () => {
    await saveQuestionSet({
      ...setDraft(),
      items: [
        draft({ fingerprint: "fp_1", category: "basic" }),
        draft({ fingerprint: "fp_2", category: "deep" }),
        draft({ fingerprint: "fp_3", category: "deep" }),
      ],
    });
    expect(await countQuestionItems("u1")).toBe(3);
    expect(await countQuestionItems("u1", { category: "deep" })).toBe(2);
    expect(await countQuestionItems("u2")).toBe(0);
  });
});

describe("setQuestionStar", () => {
  it("收藏切换", async () => {
    const res = await saveQuestionSet({ ...setDraft(), items: [draft()] });
    const id = res.inserted[0].id;
    const starred = await setQuestionStar(id, "u1", true);
    expect(starred?.starred).toBe(true);
    const unstarred = await setQuestionStar(id, "u1", false);
    expect(unstarred?.starred).toBe(false);
  });

  it("重复设置同一个值是幂等的", async () => {
    const res = await saveQuestionSet({ ...setDraft(), items: [draft()] });
    const id = res.inserted[0].id;
    await setQuestionStar(id, "u1", true);
    const again = await setQuestionStar(id, "u1", true);
    expect(again?.starred).toBe(true);
    expect(await listQuestionItems("u1", { starred: true })).toHaveLength(1);
  });

  it("别人的题目改不动,返回 null", async () => {
    const res = await saveQuestionSet({ ...setDraft(), items: [draft()] });
    const id = res.inserted[0].id;
    expect(await setQuestionStar(id, "u2", true)).toBeNull();
    expect((await listQuestionItems("u1"))[0].starred).toBe(false);
  });

  it("题目不存在时返回 null", async () => {
    expect(await setQuestionStar("nope", "u1", true)).toBeNull();
  });
});

describe("deleteQuestionItem", () => {
  it("删除单题", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      items: [draft({ fingerprint: "fp_1" }), draft({ fingerprint: "fp_2" })],
    });
    const id = res.inserted[0].id;
    expect(await deleteQuestionItem(id, "u1")).toBe(true);
    const left = await listQuestionItems("u1");
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(res.inserted[1].id);
  });

  it("别人的题目删不掉,返回 false", async () => {
    const res = await saveQuestionSet({ ...setDraft(), items: [draft()] });
    expect(await deleteQuestionItem(res.inserted[0].id, "u2")).toBe(false);
    expect(await listQuestionItems("u1")).toHaveLength(1);
  });

  it("题目不存在时返回 false", async () => {
    expect(await deleteQuestionItem("nope", "u1")).toBe(false);
  });
});

describe("deleteQuestionSet", () => {
  it("删除整套,套里的题一并消失", async () => {
    const res = await saveQuestionSet({
      ...setDraft(),
      items: [draft({ fingerprint: "fp_1" }), draft({ fingerprint: "fp_2" })],
    });
    expect(await deleteQuestionSet(res.set.id, "u1")).toBe(true);
    expect(await listQuestionItems("u1")).toHaveLength(0);
    expect(await listQuestionSetsByUser("u1")).toHaveLength(0);
  });

  it("别人的套删不掉,返回 false 且题目保留", async () => {
    const res = await saveQuestionSet({ ...setDraft(), items: [draft()] });
    expect(await deleteQuestionSet(res.set.id, "u2")).toBe(false);
    expect(await listQuestionItems("u1")).toHaveLength(1);
    expect(await listQuestionSetsByUser("u1")).toHaveLength(1);
  });

  it("套不存在时返回 false", async () => {
    expect(await deleteQuestionSet("nope", "u1")).toBe(false);
  });
});
