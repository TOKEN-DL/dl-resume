import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/question-collections/[id] —— 重命名与删除题库。
 *
 * 盯五件事:
 *   1. 未登录 401,不碰仓储层
 *   2. 别人的题库:403;不存在的:404 —— 两者要分得开,不然用户改了没反应也不知道原因
 *   3. 重名 409
 *   4. 默认题库删不掉:409
 *   5. 删题库连同套和题一起删,报删掉几套几题
 */

const getSessionMock = vi.fn();
const renameCollectionMock = vi.fn();
const deleteCollectionMock = vi.fn();
const getCollectionMock = vi.fn();
const collectionFindUniqueMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/interview/collections-repo", () => ({
  renameCollection: (...args: unknown[]) => renameCollectionMock(...args),
  deleteCollection: (...args: unknown[]) => deleteCollectionMock(...args),
  getCollection: (...args: unknown[]) => getCollectionMock(...args),
  /** mock 里也要有同名类 —— 路由靠 instanceof 认它 */
  DuplicateCollectionNameError: class DuplicateCollectionNameError extends Error {
    constructor(name: string) {
      super(`已经有同名题库了:${name}`);
      this.name = "DuplicateCollectionNameError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    questionCollection: {
      findUnique: (...args: unknown[]) => collectionFindUniqueMock(...args),
    },
  },
}));

import { PATCH, DELETE } from "./route";

function collectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qc_1",
    userId: "u1",
    name: "字节跳动",
    isDefault: false,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T09:00:00.000Z"),
    ...overrides,
  };
}

function patch(body: unknown, id = "qc_1") {
  return new Request(`http://localhost/api/question-collections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(id = "qc_1") {
  return new Request(`http://localhost/api/question-collections/${id}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });

  renameCollectionMock.mockReset();
  renameCollectionMock.mockResolvedValue(collectionRow({ name: "新名字" }));

  deleteCollectionMock.mockReset();
  deleteCollectionMock.mockResolvedValue({ deletedSets: 2, deletedQuestions: 24 });

  getCollectionMock.mockReset();
  getCollectionMock.mockResolvedValue(collectionRow());

  collectionFindUniqueMock.mockReset();
  collectionFindUniqueMock.mockResolvedValue(null);
});

describe("PATCH /api/question-collections/[id]", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(patch({ name: "新名字" }), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(401);
    expect(renameCollectionMock).not.toHaveBeenCalled();
  });

  it("重命名成功:回新的名字", async () => {
    const res = await PATCH(patch({ name: "  新名字  " }), {
      params: Promise.resolve({ id: "qc_1" }),
    });
    expect(res.status).toBe(200);
    expect(renameCollectionMock).toHaveBeenCalledWith("qc_1", "u1", "新名字");
    expect((await res.json()).collection.name).toBe("新名字");
  });

  it("空名字 400,不重命名", async () => {
    const res = await PATCH(patch({ name: "  " }), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(400);
    expect(renameCollectionMock).not.toHaveBeenCalled();
  });

  it("重名 409", async () => {
    const { DuplicateCollectionNameError } = await import("@/lib/interview/collections-repo");
    renameCollectionMock.mockRejectedValue(new DuplicateCollectionNameError("腾讯"));
    const res = await PATCH(patch({ name: "腾讯" }), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("duplicate_name");
  });

  it("改别人的题库:403 —— 存在但不是我的", async () => {
    renameCollectionMock.mockResolvedValue(null);
    collectionFindUniqueMock.mockResolvedValue({ userId: "u2" });
    const res = await PATCH(patch({ name: "新名字" }), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(403);
  });

  it("改不存在的题库:404", async () => {
    renameCollectionMock.mockResolvedValue(null);
    const res = await PATCH(patch({ name: "新名字" }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/question-collections/[id]", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(del(), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(401);
    expect(deleteCollectionMock).not.toHaveBeenCalled();
  });

  it("删除成功:报删掉几套几题", async () => {
    const res = await DELETE(del(), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(200);
    expect(deleteCollectionMock).toHaveBeenCalledWith("qc_1", "u1");
    expect(await res.json()).toMatchObject({ deletedSets: 2, deletedQuestions: 24 });
  });

  it("默认题库删不掉:409 —— 它是用户的救命绳", async () => {
    getCollectionMock.mockResolvedValue(collectionRow({ isDefault: true }));
    const res = await DELETE(del(), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("default_collection");
    expect(deleteCollectionMock).not.toHaveBeenCalled();
  });

  it("删别人的题库:403 —— 存在但不是我的", async () => {
    getCollectionMock.mockResolvedValue(null);
    collectionFindUniqueMock.mockResolvedValue({ userId: "u2" });
    const res = await DELETE(del(), { params: Promise.resolve({ id: "qc_1" }) });
    expect(res.status).toBe(403);
  });

  it("删不存在的题库:404", async () => {
    getCollectionMock.mockResolvedValue(null);
    const res = await DELETE(del("nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
