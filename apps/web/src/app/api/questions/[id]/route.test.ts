import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/questions/[id] —— 收藏切换 + 删单题。
 *
 * 盯四件事:
 *   1. 收藏是**幂等**的:传目标状态,重复设同一个值也 200
 *   2. 只改得动自己的题:别人的题 403,改不动
 *   3. 删单题同理
 *   4. 请求体用 Zod 校验:starred 必须是 boolean
 */

const getSessionMock = vi.fn();
const setQuestionStarMock = vi.fn();
const deleteQuestionItemMock = vi.fn();
const questionItemFindUniqueMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/interview/repo", () => ({
  setQuestionStar: (...args: unknown[]) => setQuestionStarMock(...args),
  deleteQuestionItem: (...args: unknown[]) => deleteQuestionItemMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    questionItem: {
      findUnique: (...args: unknown[]) => questionItemFindUniqueMock(...args),
    },
  },
}));

import { PATCH, DELETE } from "./route";

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

function patchReq(body: unknown) {
  return new Request("http://localhost/api/questions/qi_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "qi_1" }) };

function delReq() {
  return new Request("http://localhost/api/questions/qi_1", { method: "DELETE" });
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });

  setQuestionStarMock.mockReset();
  setQuestionStarMock.mockResolvedValue(itemRow());

  deleteQuestionItemMock.mockReset();
  deleteQuestionItemMock.mockResolvedValue(true);

  questionItemFindUniqueMock.mockReset();
  questionItemFindUniqueMock.mockResolvedValue(null);
});

describe("PATCH /api/questions/[id]", () => {
  it("未登录返回 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ starred: true }), ctx);
    expect(res.status).toBe(401);
    expect(setQuestionStarMock).not.toHaveBeenCalled();
  });

  it("收藏:传目标状态 + 当前用户 id,返回更新后的题目", async () => {
    setQuestionStarMock.mockResolvedValue(itemRow({ starred: true }));

    const res = await PATCH(patchReq({ starred: true }), ctx);
    expect(res.status).toBe(200);
    expect(setQuestionStarMock).toHaveBeenCalledWith("qi_1", "u1", true);

    const body = await res.json();
    expect(body.item.id).toBe("qi_1");
    expect(body.item.starred).toBe(true);
    expect(body.item.createdAt).toBe("2026-11-01T08:00:00.000Z");
  });

  it("取消收藏:传 false", async () => {
    setQuestionStarMock.mockResolvedValue(itemRow({ starred: false }));
    const res = await PATCH(patchReq({ starred: false }), ctx);
    expect(res.status).toBe(200);
    expect(setQuestionStarMock).toHaveBeenCalledWith("qi_1", "u1", false);
  });

  it("幂等:重复设置同一个状态都返回 200", async () => {
    setQuestionStarMock.mockResolvedValue(itemRow({ starred: true }));
    const first = await PATCH(patchReq({ starred: true }), ctx);
    const second = await PATCH(patchReq({ starred: true }), ctx);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("starred 必须是 boolean,传字符串 400", async () => {
    const res = await PATCH(patchReq({ starred: "yes" }), ctx);
    expect(res.status).toBe(400);
    expect(setQuestionStarMock).not.toHaveBeenCalled();
  });

  it("缺 starred 字段 400", async () => {
    const res = await PATCH(patchReq({}), ctx);
    expect(res.status).toBe(400);
  });

  it("请求体不是合法 JSON 返回 400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/questions/qi_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{oops",
      }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("改别人的题:拒绝 403,且不动他的数据", async () => {
    setQuestionStarMock.mockResolvedValue(null);
    questionItemFindUniqueMock.mockResolvedValue({ userId: "u2" });

    const res = await PATCH(patchReq({ starred: true }), ctx);
    expect(res.status).toBe(403);
    expect(setQuestionStarMock).toHaveBeenCalledWith("qi_1", "u1", true);
  });

  it("题目不存在返回 404", async () => {
    setQuestionStarMock.mockResolvedValue(null);
    questionItemFindUniqueMock.mockResolvedValue(null);

    const res = await PATCH(patchReq({ starred: true }), ctx);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/questions/[id]", () => {
  it("未登录返回 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(401);
    expect(deleteQuestionItemMock).not.toHaveBeenCalled();
  });

  it("删自己的题:按 session.sub 过滤", async () => {
    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteQuestionItemMock).toHaveBeenCalledWith("qi_1", "u1");
  });

  it("删别人的题:拒绝 403", async () => {
    deleteQuestionItemMock.mockResolvedValue(false);
    questionItemFindUniqueMock.mockResolvedValue({ userId: "u2" });

    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("题目不存在返回 404", async () => {
    deleteQuestionItemMock.mockResolvedValue(false);
    questionItemFindUniqueMock.mockResolvedValue(null);

    const res = await DELETE(delReq(), ctx);
    expect(res.status).toBe(404);
  });
});
