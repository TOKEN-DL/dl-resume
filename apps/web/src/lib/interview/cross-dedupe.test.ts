/**
 * 跨套判重的编排 —— issue #22。
 *
 * 盯四件事:
 *   1. 逐题判重:R1 精确 / R2 近似 / R3 同考点,都要抓得住,并且说清「跟哪道重复」
 *   2. 套级判定:与**任一**既有套的重复率 ≥ 55% 才算「整套高度重复」
 *   3. 重复分散在好几套时**不拦** —— 每套都不够门槛,就不该整套拦下
 *   4. 题库的行拼成「既有题」时,要带上它属于哪一套(提示条上要报得出是哪套)
 */
import { describe, it, expect, vi } from "vitest";

// 仓储层要连数据库,这里换掉 —— 判重编排本身是纯逻辑,不需要真库
vi.mock("@/lib/interview/repo", () => ({
  listQuestionItems: vi.fn(async () => []),
  listQuestionSetsByUser: vi.fn(async () => []),
}));

import { dedupeAgainstLibrary, toLibraryItems, type LibraryItem } from "./cross-dedupe";
import type { GeneratedQuestion } from "./types";

/** 题库里的一道既有题 */
function lib(overrides: Partial<LibraryItem> & { question: string }): LibraryItem {
  return {
    topic: "",
    setId: "qs_old",
    setTitle: "后端工程师简历",
    setCreatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** 本套的一道题 */
function cand(
  question: string,
  topic = "",
  overrides: Partial<GeneratedQuestion> = {},
): GeneratedQuestion {
  return {
    question,
    topic,
    category: "basic",
    difficulty: 2,
    ...overrides,
  };
}

describe("跨套判重 · 逐题", () => {
  it("一字不差的重复:R1 命中,并说清跟哪道重复", () => {
    const library = [lib({ question: "什么是 RAG？", topic: "RAG" })];

    const res = dedupeAgainstLibrary([cand("什么是 RAG?", "RAG")], library);

    expect(res.duplicateCount).toBe(1);
    expect(res.hits[0].rule).toBe("R1");
    expect(res.hits[0].matchedQuestion).toBe("什么是 RAG？");
    expect(res.hits[0].matchedSetId).toBe("qs_old");
    expect(res.duplicateIndexes).toEqual([0]);
  });

  it("换措辞的近似题:R2 命中", () => {
    const library = [lib({ question: "介绍一下 RAG 的召回策略", topic: "召回策略" })];

    const res = dedupeAgainstLibrary([cand("介绍一下 RAG 的召回策略呢", "别的考点")], library);

    expect(res.hits[0].rule).toBe("R2");
    expect(res.duplicateCount).toBe(1);
  });

  it("同考点不同问法:R3 命中(R2 抓不住的那一类)", () => {
    const library = [lib({ question: "线上事故当时怎么止损的", topic: "召回策略" })];

    const res = dedupeAgainstLibrary([cand("讲讲向量检索的召回策略", "召回策略")], library);

    expect(res.hits[0].rule).toBe("R3");
    expect(res.duplicateCount).toBe(1);
  });

  it("确实不同的题:不算重复", () => {
    const library = [lib({ question: "什么是 RAG？", topic: "RAG" })];

    const res = dedupeAgainstLibrary([cand("PostgreSQL 的索引是怎么选的", "索引选型")], library);

    expect(res.duplicateCount).toBe(0);
    expect(res.hits).toEqual([]);
    expect(res.isDuplicate).toBe(false);
  });

  it("题干归一化后是空的题不参与判重", () => {
    const library = [lib({ question: "???", topic: "" })];

    const res = dedupeAgainstLibrary([cand("???", "")], library);

    expect(res.duplicateCount).toBe(0);
  });
});

describe("跨套判重 · 套级", () => {
  /** 题库里的 12 道题,全在 qs_old 这一套里 */
  const library12 = Array.from({ length: 12 }, (_, i) =>
    lib({ question: `既有题目第 ${i + 1} 道`, topic: `考点 ${i + 1}` }),
  );

  /** 本套的 12 道题:前 n 道跟题库一模一样 */
  function set12(duplicates: number): GeneratedQuestion[] {
    return Array.from({ length: 12 }, (_, i) =>
      i < duplicates
        ? cand(`既有题目第 ${i + 1} 道`, `考点 ${i + 1}`)
        : cand(`全新题目第 ${i + 1} 道`, `新考点 ${i + 1}`),
    );
  }

  it("12 题里 7 题重复 → 整套高度重复(门槛 ceil(12 × 55%) = 7)", () => {
    const res = dedupeAgainstLibrary(set12(7), library12);

    expect(res.threshold).toBe(7);
    expect(res.duplicateCount).toBe(7);
    expect(res.isDuplicate).toBe(true);
    expect(res.matchedSet?.id).toBe("qs_old");
  });

  it("12 题里 6 题重复 → 不到门槛,不拦", () => {
    const res = dedupeAgainstLibrary(set12(6), library12);

    expect(res.threshold).toBe(7);
    expect(res.isDuplicate).toBe(false);
  });

  it("只出了 6 题时门槛按比例算:4 题重复就拦", () => {
    const candidates = [
      cand("既有题目第 1 道", "考点 1"),
      cand("既有题目第 2 道", "考点 2"),
      cand("既有题目第 3 道", "考点 3"),
      cand("既有题目第 4 道", "考点 4"),
      cand("全新题目甲", "新甲"),
      cand("全新题目乙", "新乙"),
    ];

    const res = dedupeAgainstLibrary(candidates, library12);

    expect(res.threshold).toBe(4);
    expect(res.isDuplicate).toBe(true);
  });

  it("重复分散在好几套、每套都不够门槛 → 不拦", () => {
    const split = [
      ...library12.slice(0, 4).map((l) => ({ ...l, setId: "qs_a" })),
      ...library12.slice(4, 7).map((l) => ({ ...l, setId: "qs_b" })),
    ];

    const res = dedupeAgainstLibrary(set12(7), split);

    expect(res.duplicateCount).toBe(7);
    expect(res.isDuplicate).toBe(false);
  });

  it("题库是空的:什么都不重复", () => {
    const res = dedupeAgainstLibrary(set12(0), []);

    expect(res.duplicateCount).toBe(0);
    expect(res.ratio).toBe(0);
    expect(res.isDuplicate).toBe(false);
    expect(res.matchedSet).toBeNull();
  });

  it("最像的那一套:重复最多的那一套", () => {
    const library = [
      ...library12.slice(0, 2).map((l) => ({ ...l, setId: "qs_few", setTitle: "少的那套" })),
      ...library12.slice(0, 8).map((l) => ({ ...l, setId: "qs_many", setTitle: "多的那套" })),
    ];

    const res = dedupeAgainstLibrary(set12(8), library);

    expect(res.matchedSet?.id).toBe("qs_many");
    expect(res.matchedSet?.title).toBe("多的那套");
  });
});

describe("toLibraryItems", () => {
  it("把题库行拼成既有题,并带上它属于哪一套", () => {
    const items = toLibraryItems(
      [
        {
          question: "什么是 RAG？",
          topic: "RAG",
          setId: "qs_1",
          resumeTitle: "后端工程师简历",
          createdAt: new Date("2026-10-28T00:00:00.000Z"),
        },
      ],
      [
        {
          id: "qs_1",
          resumeTitle: "后端工程师简历",
          createdAt: new Date("2026-10-28T00:00:00.000Z"),
        },
      ],
    );

    expect(items).toHaveLength(1);
    expect(items[0].setId).toBe("qs_1");
    expect(items[0].setTitle).toBe("后端工程师简历");
    expect(items[0].setCreatedAt).toBe(new Date("2026-10-28T00:00:00.000Z").getTime());
  });

  it("题干是空的行不参与判重", () => {
    const items = toLibraryItems(
      [
        {
          question: "   ",
          topic: "RAG",
          setId: "qs_1",
          resumeTitle: "后端工程师简历",
          createdAt: new Date(),
        },
      ],
      [],
    );

    expect(items).toEqual([]);
  });
});
