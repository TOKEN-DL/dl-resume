/**
 * 后台执行器(runner)—— 推进押题节点。
 *
 * 盯这些:
 *   1. 五个节点依次跑完,停在「待确认入库」,并带上 12 道题
 *   2. 每个节点都留下完成提示(给用户看的一句话结果)
 *   3. 没配密钥时标注本地兜底 —— 用例不该依赖开发机有没有配密钥
 *   4. 源数据缺失时任务标记为失败,而不是卡住
 *   5. 跨套判重在任务里的落点:出题前先查已出过的题干、跟题库比一遍、
 *      整套高度重复的结论记进任务
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GeneratedQuestion } from "./types";
import type { InterviewJob } from "./types";
import type { ResumeData } from "@/lib/validation/resume";
import { clearJobs, createJob, getJob } from "./job-store";
import { runJob } from "./runner";
import { buildLocalQuestions, scanResume } from "./generator";
import { listQuestionItems, listQuestionSetsByUser } from "@/lib/interview/repo";

// 仓储层要连数据库 —— 这里换掉,让跑任务的用例不依赖开发机上有没有库
vi.mock("@/lib/interview/repo", () => ({
  listQuestionItems: vi.fn(async () => []),
  listQuestionSetsByUser: vi.fn(async () => []),
}));

/* ─── 测试夹具 ────────────────────────────────────────────────────── */

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    basics: {
      name: "张三",
      label: "后端工程师",
      email: "a@b.com",
      phone: "",
      gender: "",
      location: "",
      avatar: "",
      summary: "",
    },
    summary: "",
    education: [],
    work: [],
    projects: [],
    skills: [],
    languages: [],
    awards: [],
    certificates: [],
    interests: "",
    ...overrides,
  };
}

const RESUME = makeResume({
  skills: [
    { id: "s1", name: "TypeScript", level: "advanced" },
    { id: "s2", name: "PostgreSQL", level: "intermediate" },
    { id: "s3", name: "Redis", level: "intermediate" },
  ],
  projects: [
    { id: "p1", name: "订单中台", role: "后端", period: { start: "", end: "", current: false }, url: "", description: "" },
    { id: "p2", name: "实时风控", role: "后端", period: { start: "", end: "", current: false }, url: "", description: "" },
  ],
});

function makeJob(id: string, userId = "u1", data?: ResumeData): InterviewJob {
  const now = Date.now();
  const job: InterviewJob = {
    id,
    userId,
    status: "queued",
    title: "测试简历",
    source: { kind: "resume", resumeId: "r1" },
    stages: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  createJob(job, { data: data ?? RESUME });
  return job;
}

let savedKey: string | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  clearJobs();
  // 题库默认是空的 —— 用例不该依赖开发机上有没有题
  vi.mocked(listQuestionItems).mockReset();
  vi.mocked(listQuestionItems).mockResolvedValue([]);
  vi.mocked(listQuestionSetsByUser).mockReset();
  vi.mocked(listQuestionSetsByUser).mockResolvedValue([]);
  // 明确走本地兜底路径 —— 用例不该依赖开发机有没有配密钥
  savedKey = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
  else process.env.MINIMAX_API_KEY = savedKey;
});

/* ─── 1. 跑完一轮 ─────────────────────────────────────────────────── */

describe("runJob", () => {
  it("跑完五个节点,停在「待确认入库」,并带上 12 道题", async () => {
    makeJob("j1");
    await runJob("j1");

    const job = getJob("j1")!;
    expect(job.status).toBe("awaiting-confirm");
    expect(job.stages.map((s) => s.key)).toEqual([
      "scan",
      "generate",
      "dedupe",
      "answer",
      "confirm",
    ]);
    expect(job.stages.every((s) => s.status === "done")).toBe(true);
    expect(job.progress).toBe(1);
    expect(job.questions).toHaveLength(12);
  }, 20000);

  it("每个节点都留下完成提示", async () => {
    makeJob("j2");
    await runJob("j2");
    const job = getJob("j2")!;
    const details = Object.fromEntries(job.stages.map((s) => [s.key, s.detail]));
    expect(details.scan).toBe("识别到 3 个技能 · 2 段项目");
    expect(details.generate).toBe("生成 12 道题");
    expect(details.dedupe).toBe("标出 0 道重复题");
    expect(details.answer).toBe("生成 12 份参考答案");
    expect(details.confirm).toBe("等你确认后写入题库");
    for (const s of job.stages) {
      expect(s.startedAt, s.key).toBeTruthy();
      expect(s.finishedAt, s.key).toBeTruthy();
    }
  }, 20000);

  it("没配密钥时标注本地兜底", async () => {
    makeJob("j3");
    await runJob("j3");
    expect(getJob("j3")!.engineNote).toContain("本地兜底");
  }, 20000);

  it("源数据缺失时任务标记为失败而不是卡住", async () => {
    const now = Date.now();
    createJob(
      {
        id: "j4",
        userId: "u1",
        status: "queued",
        title: "x",
        source: { kind: "resume", resumeId: "r1" },
        stages: [],
        progress: 0,
        createdAt: now,
        updatedAt: now,
      },
      { data: undefined },
    );
    await runJob("j4");
    expect(getJob("j4")!.status).toBe("failed");
  }, 20000);
});

/**
 * 跨套判重在任务里的落点(#22)。
 *
 * 盯三件事:
 *   1. 出题前先查这份简历已经出过的题干(最多 60 条)—— 生成前规避的第一道防线
 *   2. 查重节点跟题库里已有的题比一遍,重复的题记进任务
 *   3. 整套高度重复时任务里带着这个结论,前端据此出提示条
 */
describe("runJob · 跨套判重", () => {
  /** 把一道题拼成仓储层的行 */
  function itemRowOf(q: GeneratedQuestion, setId: string, index: number) {
    return {
      id: `qi_${index}`,
      userId: "u1",
      setId,
      resumeId: "r1",
      resumeTitle: "后端工程师简历",
      question: q.question,
      answer: "",
      topic: q.topic,
      category: q.category,
      difficulty: q.difficulty,
      fingerprint: `fp_${index}`,
      starred: false,
      createdAt: new Date(1_700_000_000_000 + index),
      updatedAt: new Date(1_700_000_000_000 + index),
    };
  }

  const setRow = {
    id: "qs_old",
    userId: "u1",
    resumeId: "r1",
    resumeTitle: "后端工程师简历",
    provider: "minimax",
    createdAt: new Date(1_700_000_000_000),
    updatedAt: new Date(1_700_000_000_000),
  };

  it("出题前先查这份简历已经出过的题干,最多 60 条", async () => {
    makeJob("j_asked");
    await runJob("j_asked");

    expect(listQuestionItems).toHaveBeenCalledWith("u1", { resumeId: "r1", limit: 60 });
  }, 20000);

  it("跟题库里已有的题比一遍:重复的题记进任务,整套判为高度重复", async () => {
    // 题库里放的正是这次要出的那 12 道题 → 12 道全重复
    const produced = buildLocalQuestions(scanResume(RESUME));
    vi.mocked(listQuestionItems).mockImplementation(async (_userId, filter) =>
      // 带 resumeId 的那次是「这份简历已出过的题干」,不带的是整个题库
      filter?.resumeId ? [] : produced.map((q, i) => itemRowOf(q, "qs_old", i)),
    );
    vi.mocked(listQuestionSetsByUser).mockResolvedValue([setRow]);

    makeJob("j_dedupe");
    await runJob("j_dedupe");

    const job = getJob("j_dedupe")!;
    expect(job.dedupe?.totalCount).toBe(12);
    expect(job.dedupe?.duplicateCount).toBe(12);
    expect(job.dedupe?.threshold).toBe(7);
    expect(job.dedupe?.isDuplicate).toBe(true);
    expect(job.dedupe?.matchedSet?.id).toBe("qs_old");
    expect(job.stages.find((s) => s.key === "dedupe")?.detail).toBe("标出 12 道重复题");
  }, 20000);

  it("题库是空的:一道都不算重复", async () => {
    makeJob("j_clean");
    await runJob("j_clean");

    const job = getJob("j_clean")!;
    expect(job.dedupe?.duplicateCount).toBe(0);
    expect(job.dedupe?.isDuplicate).toBe(false);
  }, 20000);
});
