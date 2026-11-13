/**
 * 题库分组仓储层单测 —— 2026-11-13 设计(题库自建分组)。
 *
 * TDD:先写测试,再实现。
 * 用 mock Prisma(照 repo.test.ts 的写法),不真连数据库。
 *
 * 盯五件事:
 *   1. 题库按 userId 隔离,别人的库看不见也删不掉
 *   2. 同一个用户下题库名不能重名(数据库有唯一约束,这里当业务规则报出来)
 *   3. 删题库连同里面的套和题一起删,报删掉几套几题
 *   4. 「默认题库」(isDefault)不可删
 *   5. resolveTargetCollection:有题库就用最近更新的,一个都没有就建一个默认的
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";

interface CollectionRow {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SetRow {
  id: string;
  userId: string;
  collectionId: string | null;
}

interface ItemRow {
  id: string;
  userId: string;
  setId: string;
}

/* ── mock store ──────────────────────────────────────────────────── */

const collections = new Map<string, CollectionRow>();
const sets = new Map<string, SetRow>();
const items = new Map<string, ItemRow>();
let idSeq = 1;
let tick = 0;
const newId = (prefix: string) => `${prefix}_${(idSeq++).toString().padStart(4, "0")}`;
/** 单调递增的时间戳 —— 排序在测试里才稳定 */
const now = () => new Date(1_700_000_000_000 + tick++ * 1000);

/** 复刻 Prisma 的唯一约束冲突错误 P2002 */
const prismaUniqueViolation = (): Error & { code: "P2002" } => {
  const err = new Error("Unique constraint failed on the fields: (`userId`,`name`)") as Error & {
    code: "P2002";
  };
  err.code = "P2002";
  return err;
};

function matchesCollection(row: CollectionRow, where: { id?: string; userId?: string }): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  return true;
}

vi.mock("../prisma", () => ({
  prisma: {
    questionCollection: {
      create: vi.fn(async (args: Prisma.QuestionCollectionCreateArgs) => {
        const d = args.data as { userId: string; name: string; isDefault?: boolean };
        for (const row of collections.values()) {
          if (row.userId === d.userId && row.name === d.name) throw prismaUniqueViolation();
        }
        const row: CollectionRow = {
          id: newId("qc"),
          userId: d.userId,
          name: d.name,
          isDefault: d.isDefault ?? false,
          createdAt: now(),
          updatedAt: now(),
        };
        collections.set(row.id, row);
        return row;
      }),
      findMany: vi.fn(async (args: Prisma.QuestionCollectionFindManyArgs) => {
        const where = args.where as { userId?: string; isDefault?: boolean } | undefined;
        let all = Array.from(collections.values()).filter(
          (c) =>
            (!where?.userId || c.userId === where.userId) &&
            (where?.isDefault === undefined || c.isDefault === where.isDefault),
        );
        const orderBy = args.orderBy as { updatedAt?: "asc" | "desc" } | undefined;
        if (orderBy?.updatedAt === "desc") {
          all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        return all;
      }),
      findFirst: vi.fn(async (args: Prisma.QuestionCollectionFindFirstArgs) => {
        const where = args.where as { id?: string; userId?: string } | undefined;
        return (
          Array.from(collections.values()).find((c) => !where || matchesCollection(c, where)) ??
          null
        );
      }),
      updateMany: vi.fn(async (args: Prisma.QuestionCollectionUpdateManyArgs) => {
        const where = args.where as { id?: string; userId?: string };
        const data = args.data as { name?: string };
        let count = 0;
        for (const row of collections.values()) {
          if (!matchesCollection(row, where)) continue;
          if (data.name !== undefined) {
            for (const other of collections.values()) {
              if (other.id !== row.id && other.userId === row.userId && other.name === data.name) {
                throw prismaUniqueViolation();
              }
            }
            row.name = data.name;
          }
          row.updatedAt = now();
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async (args: Prisma.QuestionCollectionDeleteManyArgs) => {
        const where = args.where as { id?: string; userId?: string };
        let count = 0;
        for (const [id, c] of Array.from(collections.entries())) {
          if (!matchesCollection(c, where)) continue;
          collections.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    questionSet: {
      findMany: vi.fn(async (args: Prisma.QuestionSetFindManyArgs) => {
        const where = args.where as { userId?: string; collectionId?: string } | undefined;
        return Array.from(sets.values()).filter(
          (s) =>
            (!where?.userId || s.userId === where.userId) &&
            (where?.collectionId === undefined || s.collectionId === where.collectionId),
        );
      }),
      deleteMany: vi.fn(async (args: Prisma.QuestionSetDeleteManyArgs) => {
        const where = args.where as { userId?: string; collectionId?: string };
        let count = 0;
        for (const [id, s] of Array.from(sets.entries())) {
          if (where.userId !== undefined && s.userId !== where.userId) continue;
          if (where.collectionId !== undefined && s.collectionId !== where.collectionId) continue;
          sets.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    questionItem: {
      deleteMany: vi.fn(async (args: Prisma.QuestionItemDeleteManyArgs) => {
        const where = args.where as { userId?: string; setId?: string };
        let count = 0;
        for (const [id, it] of Array.from(items.entries())) {
          if (where.userId !== undefined && it.userId !== where.userId) continue;
          if (where.setId !== undefined && it.setId !== where.setId) continue;
          items.delete(id);
          count += 1;
        }
        return { count };
      }),
      count: vi.fn(async (args: Prisma.QuestionItemCountArgs) => {
        const where = args.where as { userId?: string; setId?: string };
        return Array.from(items.values()).filter(
          (it) =>
            (where.userId === undefined || it.userId === where.userId) &&
            (where.setId === undefined || it.setId === where.setId),
        ).length;
      }),
    },
  },
}));

/* ── 测试 ─────────────────────────────────────────────────────────── */

import {
  DuplicateCollectionNameError,
  createCollection,
  deleteCollection,
  listCollectionsByUser,
  renameCollection,
  resolveTargetCollection,
} from "./collections-repo";

beforeEach(() => {
  collections.clear();
  sets.clear();
  items.clear();
  idSeq = 1;
  tick = 0;
});

describe("题库分组仓储层", () => {
  it("建题库:名字与归属用户记下来,默认不是系统兜底库", async () => {
    const c = await createCollection("u1", "字节跳动");
    expect(c.name).toBe("字节跳动");
    expect(c.userId).toBe("u1");
    expect(c.isDefault).toBe(false);
    expect(c.id).toBeTruthy();
  });

  it("同一个用户下题库名不能重复:第二次建同名库报错", async () => {
    await createCollection("u1", "腾讯");
    await expect(createCollection("u1", "腾讯")).rejects.toBeInstanceOf(
      DuplicateCollectionNameError,
    );
  });

  it("不同用户可以建同名题库:名字只在用户内唯一", async () => {
    await createCollection("u1", "腾讯");
    const other = await createCollection("u2", "腾讯");
    expect(other.name).toBe("腾讯");
    expect(other.userId).toBe("u2");
  });

  it("列题库只给本人:别人的库不在结果里", async () => {
    await createCollection("u1", "字节跳动");
    await createCollection("u2", "腾讯");
    const mine = await listCollectionsByUser("u1");
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("字节跳动");
  });

  it("列题库按最近更新倒序:刚建/刚改的排最前", async () => {
    await createCollection("u1", "A");
    await createCollection("u1", "B");
    await renameCollection((await listCollectionsByUser("u1"))[1].id, "u1", "B2");
    const list = await listCollectionsByUser("u1");
    expect(list[0].name).toBe("B2");
  });

  it("重命名:改成新名字,改完 updatedAt 跟着动", async () => {
    const c = await createCollection("u1", "旧名");
    // 先把时间戳取下来 —— mock 是原地改对象的,事后再读 c.updatedAt
    // 读到的是改完之后的那一份,比出来的永远是「相等」。
    const before = c.updatedAt.getTime();
    const renamed = await renameCollection(c.id, "u1", "新名");
    expect(renamed?.name).toBe("新名");
    expect(renamed?.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it("重命名撞上同名库:报错而不是静默改掉另一个", async () => {
    await createCollection("u1", "A");
    const b = await createCollection("u1", "B");
    await expect(renameCollection(b.id, "u1", "A")).rejects.toBeInstanceOf(
      DuplicateCollectionNameError,
    );
  });

  it("重命名别人的题库:返回 null(不报错也不改)", async () => {
    const c = await createCollection("u2", "别人的");
    expect(await renameCollection(c.id, "u1", "改我的")).toBeNull();
    expect((await listCollectionsByUser("u2"))[0].name).toBe("别人的");
  });

  it("删题库:里面的套和题一起没,报删掉几套几题", async () => {
    const c = await createCollection("u1", "字节跳动");
    sets.set("s1", { id: "s1", userId: "u1", collectionId: c.id });
    sets.set("s2", { id: "s2", userId: "u1", collectionId: c.id });
    items.set("i1", { id: "i1", userId: "u1", setId: "s1" });
    items.set("i2", { id: "i2", userId: "u1", setId: "s1" });
    items.set("i3", { id: "i3", userId: "u1", setId: "s2" });

    const res = await deleteCollection(c.id, "u1");
    expect(res).toEqual({ deletedSets: 2, deletedQuestions: 3 });
    expect(sets.size).toBe(0);
    expect(items.size).toBe(0);
    expect(collections.size).toBe(0);
  });

  it("删题库不动别的题库里的套与题", async () => {
    const a = await createCollection("u1", "A");
    const b = await createCollection("u1", "B");
    sets.set("s1", { id: "s1", userId: "u1", collectionId: a.id });
    sets.set("s2", { id: "s2", userId: "u1", collectionId: b.id });
    items.set("i1", { id: "i1", userId: "u1", setId: "s1" });
    items.set("i2", { id: "i2", userId: "u1", setId: "s2" });

    await deleteCollection(a.id, "u1");
    expect(sets.size).toBe(1);
    expect(items.size).toBe(1);
    expect(Array.from(items.values())[0].setId).toBe("s2");
  });

  it("删别人的题库:返回 null,一个字节都不动", async () => {
    const c = await createCollection("u2", "别人的");
    sets.set("s1", { id: "s1", userId: "u2", collectionId: c.id });
    expect(await deleteCollection(c.id, "u1")).toBeNull();
    expect(collections.size).toBe(1);
    expect(sets.size).toBe(1);
  });

  it("默认题库不可删:系统兜底的那个是用户的救命绳", async () => {
    const c = await resolveTargetCollection("u1");
    expect(c.isDefault).toBe(true);
    expect(c.name).toBe("默认题库");
    expect(await deleteCollection(c.id, "u1")).toBeNull();
    expect(collections.size).toBe(1);
  });

  it("resolveTargetCollection:已经有题库就不重复建", async () => {
    await createCollection("u1", "字节跳动");
    const c = await resolveTargetCollection("u1");
    expect(c.isDefault).toBe(false);
    expect(collections.size).toBe(1);
  });

  it("resolveTargetCollection:有题库就用最近更新的那个", async () => {
    await createCollection("u1", "A");
    const b = await createCollection("u1", "B");
    const target = await resolveTargetCollection("u1");
    expect(target.id).toBe(b.id);
  });

  it("resolveTargetCollection:一个题库都没有就建一个默认的", async () => {
    const target = await resolveTargetCollection("u1");
    expect(target.name).toBe("默认题库");
    expect(target.isDefault).toBe(true);
    expect(collections.size).toBe(1);
  });
});
