import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/interview/[jobId]/confirm —— 确认入库题库。
 *
 * 盯五件事:
 *   1. 权限:未登录 401、别人的任务 403、任务不存在 404
 *   2. 写入:题目按 job.questions 的顺序落库,指纹自己算
 *   3. 「重点关注」随入库落成 starred(按题目序号传)
 *   4. 幂等:重复确认不产生第二份,直接返回上次的结果
 *   5. 预览(preview):只算「会入库几题 / 会跳过几题」,不写库 —— 二次确认层靠它如实报数
 */

const getSessionMock = vi.fn();
const saveQuestionSetMock = vi.fn();
const findManyMock = vi.fn();
const listQuestionItemsMock = vi.fn();
const listQuestionSetsByUserMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/interview/repo", () => ({
  saveQuestionSet: (...args: unknown[]) => saveQuestionSetMock(...args),
  listQuestionItems: (...args: unknown[]) => listQuestionItemsMock(...args),
  listQuestionSetsByUser: (...args: unknown[]) => listQuestionSetsByUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    questionItem: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { POST } from "./route";
import { clearJobs, createJob, getJob } from "@/lib/interview/job-store";
import { fingerprint } from "@/lib/interview/fingerprint";
import type { InterviewJob } from "@/lib/interview/types";

/** 一行套 */
function setRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qs_new",
    userId: "u1",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    provider: "minimax",
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

/** 一行题 */
function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qi_1",
    userId: "u1",
    setId: "qs_new",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    question: "什么是 RAG？",
    answer: "检索增强生成。",
    topic: "RAG",
    category: "basic",
    difficulty: 1,
    fingerprint: "fp_1",
    starred: false,
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    ...overrides,
  };
}

/** 一个跑完、等着确认的任务 */
function makeJob(overrides: Partial<InterviewJob> = {}): InterviewJob {
  const now = Date.now();
  return {
    id: "iv_test",
    userId: "u1",
    status: "awaiting-confirm",
    title: "后端工程师简历",
    source: { kind: "resume", resumeId: "res_1" },
    stages: [],
    progress: 1,
    questions: [
      {
        question: "什么是 RAG？",
        answer: "检索增强生成。",
        topic: "RAG",
        category: "basic",
        difficulty: 1,
      },
      {
        question: "讲讲向量检索的召回策略",
        answer: "BM25 + 向量混合召回。",
        topic: "召回策略",
        category: "deep",
        difficulty: 3,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function post(body: unknown = {}) {
  return new Request("http://localhost/api/interview/iv_test/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  clearJobs();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });

  saveQuestionSetMock.mockReset();
  saveQuestionSetMock.mockResolvedValue({
    set: setRow(),
    inserted: [itemRow(), itemRow({ id: "qi_2" })],
    skipped: 0,
  });

  findManyMock.mockReset();
  findManyMock.mockResolvedValue([]);

  listQuestionItemsMock.mockReset();
  listQuestionItemsMock.mockResolvedValue([]);

  listQuestionSetsByUserMock.mockReset();
  listQuestionSetsByUserMock.mockResolvedValue([]);
});

describe("POST /api/interview/[jobId]/confirm", () => {
  it("未登录返回 401,不碰仓储层", async () => {
    getSessionMock.mockResolvedValue(null);
    createJob(makeJob(), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(res.status).toBe(401);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("任务不存在返回 404", async () => {
    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_missing" }) });

    expect(res.status).toBe(404);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("确认别人的任务返回 403,不写库", async () => {
    createJob(makeJob({ userId: "u2" }), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(res.status).toBe(403);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("任务还没跑完就确认 → 409,不写库", async () => {
    createJob(makeJob({ status: "running" }), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(res.status).toBe(409);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("请求体不合法返回 400(starredIndexes 必须是序号数组)", async () => {
    createJob(makeJob(), { data: {} });

    const res = await POST(post({ starredIndexes: ["x"] }), {
      params: Promise.resolve({ jobId: "iv_test" }),
    });

    expect(res.status).toBe(400);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("确认成功:返回入库题数、跳过题数与套 id", async () => {
    createJob(makeJob(), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.setId).toBe("qs_new");
  });

  it("写库参数:userId 取本人、来源简历与标题取自任务", async () => {
    createJob(makeJob(), { data: {} });

    await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(saveQuestionSetMock).toHaveBeenCalledTimes(1);
    const arg = saveQuestionSetMock.mock.calls[0][0];
    expect(arg.userId).toBe("u1");
    expect(arg.resumeId).toBe("res_1");
    expect(arg.resumeTitle).toBe("后端工程师简历");
    expect(arg.provider).toBe("minimax");
  });

  it("写库的题目按 job.questions 的顺序,指纹自己算", async () => {
    createJob(makeJob(), { data: {} });

    await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    const items = saveQuestionSetMock.mock.calls[0][0].items;
    expect(items).toHaveLength(2);
    expect(items[0].question).toBe("什么是 RAG？");
    expect(items[0].answer).toBe("检索增强生成。");
    expect(items[0].topic).toBe("RAG");
    expect(items[0].category).toBe("basic");
    expect(items[0].difficulty).toBe(1);
    expect(items[0].fingerprint).toBe(fingerprint("什么是 RAG？"));
    expect(items[1].fingerprint).toBe(fingerprint("讲讲向量检索的召回策略"));
  });

  it("「重点关注」的题目落成 starred,其余不带收藏", async () => {
    createJob(makeJob(), { data: {} });

    await POST(post({ starredIndexes: [1] }), { params: Promise.resolve({ jobId: "iv_test" }) });

    const items = saveQuestionSetMock.mock.calls[0][0].items;
    expect(items[0].starred).toBe(false);
    expect(items[1].starred).toBe(true);
  });

  it("库里已有的重复题如实计入跳过数", async () => {
    saveQuestionSetMock.mockResolvedValue({
      set: setRow(),
      inserted: [itemRow()],
      skipped: 3,
    });
    createJob(makeJob(), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const body = await res.json();

    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(3);
  });

  it("走本地兜底的任务,provider 记成 local", async () => {
    createJob(makeJob({ engineNote: "本地兜底:模板化问题,参考答案仅为要点提纲" }), { data: {} });

    await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(saveQuestionSetMock.mock.calls[0][0].provider).toBe("local");
  });

  it("入库后任务状态变 confirmed,并记住套 id", async () => {
    createJob(makeJob(), { data: {} });

    await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });

    const job = getJob("iv_test");
    expect(job?.status).toBe("confirmed");
    expect(job?.resultSetId).toBe("qs_new");
  });

  it("重复确认不产生第二份:直接返回上次的结果,不再写库", async () => {
    createJob(makeJob(), { data: {} });

    const first = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const firstBody = await first.json();

    const second = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const secondBody = await second.json();

    expect(saveQuestionSetMock).toHaveBeenCalledTimes(1);
    expect(secondBody.setId).toBe(firstBody.setId);
    expect(secondBody.inserted).toBe(firstBody.inserted);
    expect(secondBody.skipped).toBe(firstBody.skipped);
  });

  it("预览只算不写:给出「会入库几题 / 会跳过几题」,套 id 为空", async () => {
    createJob(makeJob(), { data: {} });
    findManyMock.mockResolvedValue([{ fingerprint: fingerprint("什么是 RAG？") }]);

    const res = await POST(post({ preview: true }), {
      params: Promise.resolve({ jobId: "iv_test" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.setId).toBeNull();
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
    expect(getJob("iv_test")?.status).toBe("awaiting-confirm");
  });

  it("预览按 userId 查已有题,只认自己库里的重复", async () => {
    createJob(makeJob(), { data: {} });

    await POST(post({ preview: true }), { params: Promise.resolve({ jobId: "iv_test" }) });

    const arg = findManyMock.mock.calls[0][0];
    expect(arg.where.userId).toBe("u1");
    expect(arg.where.fingerprint.in).toEqual([
      fingerprint("什么是 RAG？"),
      fingerprint("讲讲向量检索的召回策略"),
    ]);
  });
});

/**
 * 跨套判重接入(#22)—— 入库这一段。
 *
 * 盯四件事:
 *   1. 题库里已有的题**不写入**(跨套判重,不只是唯一约束能挡的那种)
 *   2. 整套重复率超阈值 → 整套不入库,报 409
 *   3. 用户拍板(force)→ 只写入不重复的题,重复的题跳过
 *   4. 二次确认层报的数字里,跨套跳过的题也要算进去
 */
describe("POST /api/interview/[jobId]/confirm · 跨套判重", () => {
  /** 题库里的一道题 */
  function libItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "qi_old",
      userId: "u1",
      setId: "qs_old",
      resumeId: "res_1",
      resumeTitle: "后端工程师简历",
      question: "什么是 RAG？",
      answer: "检索增强生成。",
      topic: "RAG",
      category: "basic",
      difficulty: 1,
      fingerprint: "fp_old",
      starred: false,
      createdAt: new Date("2026-10-28T00:00:00.000Z"),
      updatedAt: new Date("2026-10-28T00:00:00.000Z"),
      ...overrides,
    };
  }

  /** 题库里那一套 */
  const oldSet = {
    id: "qs_old",
    userId: "u1",
    resumeId: "res_1",
    resumeTitle: "后端工程师简历",
    provider: "minimax",
    createdAt: new Date("2026-10-28T00:00:00.000Z"),
    updatedAt: new Date("2026-10-28T00:00:00.000Z"),
  };

  /** 写库时按传入的题目如实回 —— 免得测出来的是 mock 的固定值 */
  function echoSavedItems() {
    saveQuestionSetMock.mockImplementation(async (arg: { items: { question: string }[] }) => ({
      set: setRow(),
      inserted: arg.items.map((it, i) => itemRow({ id: `qi_new_${i}`, question: it.question })),
      skipped: 0,
    }));
  }

  /** 三道题的任务:前两道在题库里已经有了 */
  function jobWithThree() {
    return makeJob({
      questions: [
        { question: "什么是 RAG？", answer: "a", topic: "RAG", category: "basic", difficulty: 1 },
        { question: "讲讲向量检索的召回策略", answer: "b", topic: "召回策略", category: "deep", difficulty: 3 },
        { question: "PostgreSQL 的索引怎么选", answer: "c", topic: "索引选型", category: "basic", difficulty: 2 },
      ],
    });
  }

  beforeEach(() => {
    echoSavedItems();
    listQuestionItemsMock.mockResolvedValue([
      libItem(),
      libItem({
        id: "qi_old_2",
        question: "讲讲向量检索的召回策略",
        topic: "召回策略",
        category: "deep",
        difficulty: 3,
      }),
    ]);
    listQuestionSetsByUserMock.mockResolvedValue([oldSet]);
  });

  it("题库里已有的题不写入:只写不重复的那几道", async () => {
    // 只有一道撞上(1/3 < 55%)→ 整套照常入库,但那道重复题不写
    listQuestionItemsMock.mockResolvedValue([libItem()]);
    createJob(jobWithThree(), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const body = await res.json();

    const items = saveQuestionSetMock.mock.calls[0][0].items;
    expect(items).toHaveLength(2);
    expect(items.map((i: { question: string }) => i.question)).toEqual([
      "讲讲向量检索的召回策略",
      "PostgreSQL 的索引怎么选",
    ]);
    expect(body.inserted).toBe(2);
    expect(body.skipped).toBe(1);
  });

  it("整套重复率超阈值:整套不入库,报 409", async () => {
    createJob(jobWithThree(), { data: {} });

    const res = await POST(post(), { params: Promise.resolve({ jobId: "iv_test" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("set_duplicate");
    expect(body.duplicateCount).toBe(2);
    expect(body.totalCount).toBe(3);
    expect(body.matchedSet.id).toBe("qs_old");
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("用户拍板(force):只写入不重复的题,重复的题跳过", async () => {
    createJob(jobWithThree(), { data: {} });

    const res = await POST(post({ force: true }), {
      params: Promise.resolve({ jobId: "iv_test" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    const items = saveQuestionSetMock.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0].question).toBe("PostgreSQL 的索引怎么选");
    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(2);
  });

  it("全部都是重复题时:没有可入库的题,不建空套", async () => {
    createJob(
      makeJob({
        questions: [
          { question: "什么是 RAG？", answer: "a", topic: "RAG", category: "basic", difficulty: 1 },
        ],
      }),
      { data: {} },
    );

    const res = await POST(post({ force: true }), {
      params: Promise.resolve({ jobId: "iv_test" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("all_duplicate");
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("预览报的数字里,跨套判重跳过的题也算进去", async () => {
    createJob(jobWithThree(), { data: {} });

    const res = await POST(post({ preview: true }), {
      params: Promise.resolve({ jobId: "iv_test" }),
    });
    const body = await res.json();

    expect(body.inserted).toBe(1);
    expect(body.skipped).toBe(2);
    expect(saveQuestionSetMock).not.toHaveBeenCalled();
  });

  it("题库读的是本人的题库,按 userId 隔离", async () => {
    createJob(jobWithThree(), { data: {} });

    await POST(post({ force: true }), { params: Promise.resolve({ jobId: "iv_test" }) });

    expect(listQuestionItemsMock).toHaveBeenCalledWith("u1");
    expect(listQuestionSetsByUserMock).toHaveBeenCalledWith("u1");
  });
});
