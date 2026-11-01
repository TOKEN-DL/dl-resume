import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/questions —— 我的题库列表 + 删整套。
 *
 * 盯四件事:
 *   1. 一切读写都按 session.sub 过滤 —— 题库不共享
 *   2. 列表按批次分组:sets 带题数,只含有命中题目的套
 *   3. 筛选参数(设计文档 §7)透传给仓储层,非法值 400
 *   4. 删整套:别人的套 403,不存在的套 404
 */

const getSessionMock = vi.fn();
const listQuestionItemsMock = vi.fn();
const countQuestionItemsMock = vi.fn();
const listQuestionSetsByUserMock = vi.fn();
const deleteQuestionSetMock = vi.fn();
const questionSetFindUniqueMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/interview/repo", () => ({
  listQuestionItems: (...args: unknown[]) => listQuestionItemsMock(...args),
  countQuestionItems: (...args: unknown[]) => countQuestionItemsMock(...args),
  listQuestionSetsByUser: (...args: unknown[]) => listQuestionSetsByUserMock(...args),
  deleteQuestionSet: (...args: unknown[]) => deleteQuestionSetMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    questionSet: {
      findUnique: (...args: unknown[]) => questionSetFindUniqueMock(...args),
    },
  },
}));

import { GET, DELETE } from "./route";

/** 一行题目(字段与仓储层一致) */
function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qi_1",
    userId: "u1",
    setId: "qs_1",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    question: "介绍一下 RAG 的召回策略",
    answer: "BM25 + 向量混合召回,RRF 融合。",
    topic: "RAG 召回策略",
    category: "basic",
    difficulty: 2,
    fingerprint: "fp_1",
    starred: false,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

/** 一行套 */
function setRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qs_1",
    userId: "u1",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    provider: "minimax",
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

function get(url = "http://localhost/api/questions") {
  return new Request(url, { method: "GET" });
}

function del(url = "http://localhost/api/questions?setId=qs_1") {
  return new Request(url, { method: "DELETE" });
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });

  listQuestionItemsMock.mockReset();
  listQuestionItemsMock.mockResolvedValue([itemRow()]);

  countQuestionItemsMock.mockReset();
  countQuestionItemsMock.mockResolvedValue(1);

  listQuestionSetsByUserMock.mockReset();
  listQuestionSetsByUserMock.mockResolvedValue([setRow()]);

  deleteQuestionSetMock.mockReset();
  deleteQuestionSetMock.mockResolvedValue(true);

  questionSetFindUniqueMock.mockReset();
  questionSetFindUniqueMock.mockResolvedValue(null);
});

describe("GET /api/questions", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(listQuestionItemsMock).not.toHaveBeenCalled();
  });

  it("只列当前用户的题目:userId 一律取 session.sub", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(listQuestionItemsMock).toHaveBeenCalledWith("u1", {});
    expect(countQuestionItemsMock).toHaveBeenCalledWith("u1", {});
    expect(listQuestionSetsByUserMock).toHaveBeenCalledWith("u1");
  });

  it("返回 items / total / sets 三段,时间是 ISO 字符串", async () => {
    const res = await GET(get());
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("qi_1");
    expect(body.items[0].createdAt).toBe("2026-11-01T08:00:00.000Z");
    expect(body.items[0].starred).toBe(false);
    expect(body.sets[0].id).toBe("qs_1");
    expect(body.sets[0].resumeTitle).toBe("后端工程师简历");
    expect(body.sets[0].provider).toBe("minimax");
    expect(body.sets[0].createdAt).toBe("2026-11-01T08:00:00.000Z");
  });

  it("不把 userId / fingerprint 抖给客户端", async () => {
    const res = await GET(get());
    const body = await res.json();
    expect(body.items[0].userId).toBeUndefined();
    expect(body.items[0].fingerprint).toBeUndefined();
  });

  it("组头带题数:数的是这一套里命中筛选的题数", async () => {
    listQuestionItemsMock.mockResolvedValue([
      itemRow({ id: "qi_1", setId: "qs_1" }),
      itemRow({ id: "qi_2", setId: "qs_1" }),
      itemRow({ id: "qi_3", setId: "qs_2" }),
    ]);
    listQuestionSetsByUserMock.mockResolvedValue([setRow(), setRow({ id: "qs_2" })]);

    const res = await GET(get());
    const body = await res.json();
    const s1 = body.sets.find((s: { id: string }) => s.id === "qs_1");
    const s2 = body.sets.find((s: { id: string }) => s.id === "qs_2");
    expect(s1.count).toBe(2);
    expect(s2.count).toBe(1);
  });

  it("没有命中题目的套不出现在 sets 里(不显示空组)", async () => {
    listQuestionItemsMock.mockResolvedValue([itemRow({ setId: "qs_1" })]);
    listQuestionSetsByUserMock.mockResolvedValue([
      setRow({ id: "qs_1" }),
      setRow({ id: "qs_empty" }),
    ]);

    const res = await GET(get());
    const body = await res.json();
    expect(body.sets.map((s: { id: string }) => s.id)).toEqual(["qs_1"]);
  });

  it("筛选参数透传:category / difficulty / starred / q / setId / resumeId", async () => {
    await GET(
      get(
        "http://localhost/api/questions?category=deep&difficulty=3&starred=true&q=RAG&setId=qs_1&resumeId=res_1",
      ),
    );
    expect(listQuestionItemsMock).toHaveBeenCalledWith("u1", {
      category: "deep",
      difficulty: 3,
      starred: true,
      q: "RAG",
      setId: "qs_1",
      resumeId: "res_1",
    });
  });

  it("空字符串参数当作没传(不把空关键词塞给仓储层)", async () => {
    await GET(get("http://localhost/api/questions?q=&category="));
    expect(listQuestionItemsMock).toHaveBeenCalledWith("u1", {});
  });

  it("starred=false 也认(不是只认 true)", async () => {
    await GET(get("http://localhost/api/questions?starred=false"));
    expect(listQuestionItemsMock).toHaveBeenCalledWith("u1", { starred: false });
  });

  it("非法 category 返回 400", async () => {
    const res = await GET(get("http://localhost/api/questions?category=weird"));
    expect(res.status).toBe(400);
    expect(listQuestionItemsMock).not.toHaveBeenCalled();
  });

  it("非法 difficulty 返回 400(超出 1~4)", async () => {
    const res = await GET(get("http://localhost/api/questions?difficulty=9"));
    expect(res.status).toBe(400);
  });

  it("非法 starred 返回 400", async () => {
    const res = await GET(get("http://localhost/api/questions?starred=yes"));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/questions", () => {
  it("未登录返回 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(del());
    expect(res.status).toBe(401);
    expect(deleteQuestionSetMock).not.toHaveBeenCalled();
  });

  it("带 setId 时删整套,并按 session.sub 过滤", async () => {
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteQuestionSetMock).toHaveBeenCalledWith("qs_1", "u1");
  });

  it("缺 setId 返回 400", async () => {
    const res = await DELETE(del("http://localhost/api/questions"));
    expect(res.status).toBe(400);
    expect(deleteQuestionSetMock).not.toHaveBeenCalled();
  });

  it("删自己的套时只删自己那套(套属于别的用户就删不掉)", async () => {
    deleteQuestionSetMock.mockResolvedValue(false);
    questionSetFindUniqueMock.mockResolvedValue({ userId: "u2" });

    const res = await DELETE(del());
    expect(res.status).toBe(403);
    expect(deleteQuestionSetMock).toHaveBeenCalledWith("qs_1", "u1");
  });

  it("套不存在返回 404", async () => {
    deleteQuestionSetMock.mockResolvedValue(false);
    questionSetFindUniqueMock.mockResolvedValue(null);

    const res = await DELETE(del());
    expect(res.status).toBe(404);
  });
});
