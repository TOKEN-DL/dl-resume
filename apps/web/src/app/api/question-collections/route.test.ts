import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/question-collections —— 题库(用户自建的分组)的列表与新建。
 *
 * 盯四件事:
 *   1. 一切读写都按 session.sub 过滤 —— 题库不共享
 *   2. 列表带上每个库有几套几题(题库块头要显示)
 *   3. 新建:空名字 400;重名 409
 *   4. 未登录 401,不碰仓储层
 */

const getSessionMock = vi.fn();
const listCollectionsMock = vi.fn();
const createCollectionMock = vi.fn();
const listQuestionSetsByUserMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/interview/collections-repo", () => ({
  listCollectionsByUser: (...args: unknown[]) => listCollectionsMock(...args),
  createCollection: (...args: unknown[]) => createCollectionMock(...args),
  /** mock 里也要有同名类 —— 路由靠 instanceof 认它 */
  DuplicateCollectionNameError: class DuplicateCollectionNameError extends Error {
    constructor(name: string) {
      super(`已经有同名题库了:${name}`);
      this.name = "DuplicateCollectionNameError";
    }
  },
}));

vi.mock("@/lib/interview/repo", () => ({
  listQuestionSetsByUserWithCounts: (...args: unknown[]) =>
    listQuestionSetsByUserMock(...args),
}));

import { GET, POST } from "./route";

function collectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qc_1",
    userId: "u1",
    name: "字节跳动",
    isDefault: false,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

function setRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qs_1",
    userId: "u1",
    collectionId: "qc_1",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    provider: "minimax",
    /** 套里一共几道题(仓储层连着 count 一起取回来) */
    itemCount: 1,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost/api/question-collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });

  listCollectionsMock.mockReset();
  listCollectionsMock.mockResolvedValue([collectionRow()]);

  createCollectionMock.mockReset();
  createCollectionMock.mockResolvedValue(collectionRow({ name: "新题库" }));

  listQuestionSetsByUserMock.mockReset();
  listQuestionSetsByUserMock.mockResolvedValue([setRow()]);
});

describe("GET /api/question-collections", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listCollectionsMock).not.toHaveBeenCalled();
  });

  it("列出该用户的题库,并带上每个库有几套几题", async () => {
    listQuestionSetsByUserMock.mockResolvedValue([
      setRow({ id: "qs_1", collectionId: "qc_1", itemCount: 4 }),
      setRow({ id: "qs_2", collectionId: "qc_1", itemCount: 8 }),
      setRow({ id: "qs_3", collectionId: "qc_2", itemCount: 12 }),
    ]);
    listCollectionsMock.mockResolvedValue([
      collectionRow({ id: "qc_1", name: "字节跳动" }),
      collectionRow({ id: "qc_2", name: "腾讯" }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(2);
    expect(body.collections[0]).toMatchObject({
      id: "qc_1",
      name: "字节跳动",
      setCount: 2,
      questionCount: 12,
    });
    expect(body.collections[1]).toMatchObject({ id: "qc_2", setCount: 1, questionCount: 12 });
  });

  it("一个套都没有的题库:套数与题数都是 0", async () => {
    listQuestionSetsByUserMock.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.collections[0]).toMatchObject({ setCount: 0, questionCount: 0 });
  });
});

describe("POST /api/question-collections", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(post({ name: "字节跳动" }));
    expect(res.status).toBe(401);
    expect(createCollectionMock).not.toHaveBeenCalled();
  });

  it("建题库:名字去掉首尾空格后落库", async () => {
    const res = await POST(post({ name: "  字节跳动  " }));
    expect(res.status).toBe(201);
    expect(createCollectionMock).toHaveBeenCalledWith("u1", "字节跳动");
    const body = await res.json();
    expect(body.collection.name).toBe("新题库");
  });

  it("空名字 400,不建库", async () => {
    const res = await POST(post({ name: "   " }));
    expect(res.status).toBe(400);
    expect(createCollectionMock).not.toHaveBeenCalled();
  });

  it("重名 409:告诉用户「已经有同名题库了」", async () => {
    const { DuplicateCollectionNameError } = await import("@/lib/interview/collections-repo");
    createCollectionMock.mockRejectedValue(new DuplicateCollectionNameError("字节跳动"));
    const res = await POST(post({ name: "字节跳动" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("duplicate_name");
  });});
