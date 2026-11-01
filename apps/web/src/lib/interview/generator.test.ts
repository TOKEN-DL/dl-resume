// @vitest-environment jsdom
/**
 * 面试押题模块的测试。
 *
 * 这个文件覆盖三层:
 *   1. 节点定义(stages)—— 五个节点的名字与顺序
 *   2. 出题引擎(generator)—— 本地兜底、模型协议、套内判重
 *   3. 工作台组件(interview-workspace / source-picker / progress-panel)
 *
 * 本仓库给押题模块只留了这一个测试文件,所以组件层的用例也放在这里。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { STAGES, STAGE_MAP, STAGE_STATUS_LABEL, MIN_STAGE_MS } from "./stages";
import {
  LOCAL_ENGINE_NOTE,
  TOPIC_MISSING_NOTE,
  buildAnswerPrompt,
  buildLocalAnswers,
  buildLocalQuestions,
  buildQuestionPrompt,
  dedupeWithinSet,
  parseAnswerPayload,
  parseQuestionPayload,
  scanResume,
  stripEmoji,
} from "./generator";
import type { GeneratedQuestion, InterviewJobSummary, InterviewQuestion } from "./types";
import type { InterviewJob } from "./types";
import type { ResumeData } from "@/lib/validation/resume";
import { clearJobs, createJob, getJob, listActiveJobs, listJobs, updateJob } from "./job-store";
import { runJob } from "./runner";
import { InterviewWorkspace } from "@/components/interview/interview-workspace";
import { SourcePicker } from "@/components/interview/source-picker";
import { ProgressPanel } from "@/components/interview/progress-panel";

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

/** 表情符号探测 —— 与 generator 里剥除用的是同一套范围 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;

function expectNoEmoji(text: string) {
  expect(EMOJI_RE.test(text)).toBe(false);
}

/* ─── 1. 节点定义 ─────────────────────────────────────────────────── */

describe("押题节点定义", () => {
  it("五个节点,顺序是 扫描 → 出题 → 查重 → 出答案 → 待确认入库", () => {
    expect(STAGES.map((s) => s.key)).toEqual([
      "scan",
      "generate",
      "dedupe",
      "answer",
      "confirm",
    ]);
    expect(STAGES.map((s) => s.title)).toEqual([
      "简历扫描",
      "出题",
      "查重",
      "出答案",
      "待确认入库",
    ]);
  });

  it("每个节点都能按 key 查到定义", () => {
    expect(STAGE_MAP.scan.title).toBe("简历扫描");
    expect(STAGE_MAP.confirm.title).toBe("待确认入库");
  });

  it("节点状态有五种,都有可读文案", () => {
    expect(Object.keys(STAGE_STATUS_LABEL).sort()).toEqual(
      ["done", "failed", "pending", "running", "skipped"].sort(),
    );
    for (const label of Object.values(STAGE_STATUS_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("每个节点最短展示 420ms —— 太快了进度条会跳变", () => {
    expect(MIN_STAGE_MS).toBe(420);
  });
});

/* ─── 2. 简历扫描 ─────────────────────────────────────────────────── */

describe("scanResume", () => {
  it("数出技能与项目", () => {
    const scan = scanResume(RESUME);
    expect(scan.skillCount).toBe(3);
    expect(scan.projectCount).toBe(2);
  });

  it("关键词来自技能与项目", () => {
    const scan = scanResume(RESUME);
    expect(scan.keywords).toContain("TypeScript");
    expect(scan.keywords).toContain("订单中台");
  });

  it("空简历也不会炸,关键词退回目标岗位", () => {
    const scan = scanResume(makeResume());
    expect(scan.skillCount).toBe(0);
    expect(scan.projectCount).toBe(0);
    expect(scan.keywords.length).toBeGreaterThan(0);
  });
});

/* ─── 3. 本地兜底出题 ─────────────────────────────────────────────── */

describe("本地兜底出题", () => {
  const questions = buildLocalQuestions(scanResume(RESUME));

  it("出满 12 道题", () => {
    expect(questions).toHaveLength(12);
  });

  it("四档难度各 3 道", () => {
    const counts = new Map<number, number>();
    for (const q of questions) counts.set(q.difficulty, (counts.get(q.difficulty) ?? 0) + 1);
    expect([...counts.entries()].sort()).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });

  it("基础 6 道、深挖 6 道", () => {
    expect(questions.filter((q) => q.category === "basic")).toHaveLength(6);
    expect(questions.filter((q) => q.category === "deep")).toHaveLength(6);
  });

  it("每档难度里的基础/深挖配比固定:前两档 2:1,后两档 1:2", () => {
    for (const level of [1, 2, 3, 4] as const) {
      const at = questions.filter((q) => q.difficulty === level);
      const basic = at.filter((q) => q.category === "basic").length;
      const deep = at.filter((q) => q.category === "deep").length;
      if (level <= 2) expect([basic, deep]).toEqual([2, 1]);
      else expect([basic, deep]).toEqual([1, 2]);
    }
  });

  it("按难度升序排 —— 前面偏基础,后面偏深挖", () => {
    const levels = questions.map((q) => q.difficulty);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("考点两两不同(否则套内判重会把自己的题判成重复)", () => {
    const topics = questions.map((q) => q.topic);
    expect(new Set(topics).size).toBe(questions.length);
  });

  it("题干带上了简历里的关键词", () => {
    expect(questions.some((q) => q.question.includes("TypeScript"))).toBe(true);
    expect(questions.some((q) => q.question.includes("订单中台"))).toBe(true);
  });

  it("题干里没有表情符号", () => {
    for (const q of questions) expectNoEmoji(q.question);
  });

  it("参考答案只是要点提纲,不是编出来的成果", () => {
    const answers = buildLocalAnswers(questions);
    expect(answers).toHaveLength(12);
    for (const a of answers) {
      expect(a.trim().length).toBeGreaterThan(0);
      expect(a).toContain("要点");
    }
  });

  it("参考答案里没有表情符号", () => {
    for (const a of buildLocalAnswers(questions)) expectNoEmoji(a);
  });

  it("兜底模式的说明写在引擎备注里", () => {
    expect(LOCAL_ENGINE_NOTE).toContain("本地兜底");
  });
});

/* ─── 4. 模型协议:出题 ────────────────────────────────────────────── */

describe("出题提示词", () => {
  const { system, user } = buildQuestionPrompt(RESUME);

  it("要求严格 12 道", () => {
    expect(system).toContain("12");
  });

  it("要求四档难度固定分布", () => {
    expect(system).toContain("难度");
    expect(system).toContain("基础");
    expect(system).toContain("深挖");
  });

  it("要求每题带考点关键词", () => {
    expect(system).toContain("topic");
  });

  it("明令不许编造简历里没有的内容", () => {
    expect(system).toContain("编造");
  });

  it("明令只输出 JSON,并给出输出格式", () => {
    expect(system).toContain("JSON");
    expect(system).toContain("questions");
  });

  it("用户提示词带上简历与目标岗位", () => {
    expect(user).toContain("后端工程师");
    expect(user).toContain("TypeScript");
  });

  it("用户提示词里的简历去掉了头像", () => {
    const withAvatar = makeResume({
      basics: { ...makeResume().basics, avatar: "data:image/png;base64,AAAA" },
    });
    expect(buildQuestionPrompt(withAvatar).user).not.toContain("base64");
  });
});

describe("出答案提示词", () => {
  const kept: GeneratedQuestion[] = [
    { question: "聊聊 TypeScript 的类型体操", topic: "TypeScript 类型体操", category: "basic", difficulty: 2 },
  ];
  const { system, user } = buildAnswerPrompt(RESUME, kept);

  it("要求给可背诵的要点,不许写空话", () => {
    expect(system).toContain("要点");
    expect(system).toContain("空话");
  });

  it("明令不许编造", () => {
    expect(system).toContain("编造");
  });

  it("只输出 JSON,index 是题目序号", () => {
    expect(system).toContain("JSON");
    expect(system).toContain("index");
  });

  it("用户提示词带上题目清单与简历", () => {
    expect(user).toContain("TypeScript 的类型体操");
    expect(user).toContain("后端工程师");
  });
});

/* ─── 5. 模型协议:解析 ────────────────────────────────────────────── */

describe("出题结果解析", () => {
  it("解析标准 JSON", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "什么是索引?", topic: "索引原理", category: "basic", difficulty: 1 },
          { question: "索引怎么设计?", topic: "索引设计", category: "deep", difficulty: 3 },
        ],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.questions).toHaveLength(2);
    expect(parsed!.questions[0].topic).toBe("索引原理");
    expect(parsed!.questions[0].difficulty).toBe(1);
    expect(parsed!.topicMissing).toBe(false);
  });

  it("能处理 ```json 围栏与思考块", () => {
    const parsed = parseQuestionPayload(
      "<think>先想一下</think>\n```json\n" +
        JSON.stringify({ questions: [{ question: "什么是索引?", topic: "索引原理", category: "basic", difficulty: 1 }] }) +
        "\n```",
    );
    expect(parsed!.questions).toHaveLength(1);
  });

  it("难度超出范围会被夹到 1-4", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "A", topic: "t1", category: "basic", difficulty: 9 },
          { question: "B", topic: "t2", category: "basic", difficulty: 0 },
        ],
      }),
    );
    expect(parsed!.questions[0].difficulty).toBe(4);
    expect(parsed!.questions[1].difficulty).toBe(1);
  });

  it("空题干被丢掉", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "  ", topic: "t1", category: "basic", difficulty: 1 },
          { question: "有效的题", topic: "t2", category: "basic", difficulty: 1 },
        ],
      }),
    );
    expect(parsed!.questions).toHaveLength(1);
    expect(parsed!.questions[0].question).toBe("有效的题");
  });

  it("缺考点时标记 topicMissing,好让引擎备注里说明精度下降", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({ questions: [{ question: "有效的题", category: "basic", difficulty: 1 }] }),
    );
    expect(parsed!.topicMissing).toBe(true);
    expect(parsed!.questions[0].topic).toBe("");
    expect(TOPIC_MISSING_NOTE).toContain("考点");
  });

  it("题干里的表情符号被剥掉", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({ questions: [{ question: "什么是索引? 🚀", topic: "t", category: "basic", difficulty: 1 }] }),
    );
    expectNoEmoji(parsed!.questions[0].question);
  });

  it("完全不是 JSON 时返回 null", () => {
    expect(parseQuestionPayload("模型今天不想说话")).toBeNull();
  });
});

describe("出答案结果解析", () => {
  it("按 index 把答案挂回题目", () => {
    const map = parseAnswerPayload(
      JSON.stringify({ answers: [{ index: 0, answer: "答案零" }, { index: 1, answer: "答案一" }] }),
      2,
    );
    expect(map.get(0)).toBe("答案零");
    expect(map.get(1)).toBe("答案一");
  });

  it("越界的 index 被丢掉(不猜不编)", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 5, answer: "越界" }] }), 2);
    expect(map.size).toBe(0);
  });

  it("缺 index 的题目拿不到答案", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 0, answer: "有" }] }), 3);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
  });

  it("答案里的表情符号被剥掉", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 0, answer: "要点 ✅" }] }), 1);
    expectNoEmoji(map.get(0)!);
  });
});

describe("stripEmoji", () => {
  it("剥掉常见表情,保留中文正文", () => {
    expect(stripEmoji("🚀 讲讲你的项目 🎯")).toBe("讲讲你的项目");
  });
});

/* ─── 6. 套内判重 ─────────────────────────────────────────────────── */

describe("套内判重", () => {
  const base: GeneratedQuestion[] = [
    { question: "介绍一下 RAG 的召回策略", topic: "RAG 召回策略", category: "basic", difficulty: 1 },
    { question: "RAG 的召回策略你为什么这么选", topic: "RAG 召回策略", category: "deep", difficulty: 2 },
    { question: "聊聊向量数据库的选型", topic: "向量数据库选型", category: "basic", difficulty: 1 },
  ];

  it("同一套里同考点的题只留一道", () => {
    const { kept, skipped } = dedupeWithinSet(base);
    expect(kept).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(kept[0].question).toBe("介绍一下 RAG 的召回策略");
  });

  it("完全不同的题都留下", () => {
    const { kept, skipped } = dedupeWithinSet([base[0], base[2]]);
    expect(kept).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it("一字不差的重复会被抓掉", () => {
    const { skipped } = dedupeWithinSet([
      { question: "什么是索引?", topic: "索引", category: "basic", difficulty: 1 },
      { question: "什么是索引?", topic: "别的考点", category: "basic", difficulty: 1 },
    ]);
    expect(skipped).toBe(1);
  });

  it("考点为空时不启用同考点判定", () => {
    const { kept, skipped } = dedupeWithinSet([
      { question: "什么是索引?", topic: "", category: "basic", difficulty: 1 },
      { question: "什么是索引?", topic: "", category: "basic", difficulty: 1 },
    ]);
    expect(skipped).toBe(1);
    expect(kept).toHaveLength(1);
  });
});

/* ─── 7. 任务表与节点推进 ─────────────────────────────────────────── */

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

describe("押题任务表", () => {
  it("任务列表按用户隔离", () => {
    makeJob("j1", "u1");
    makeJob("j2", "u2");
    expect(listJobs("u1").map((j) => j.id)).toEqual(["j1"]);
    expect(listJobs("u2").map((j) => j.id)).toEqual(["j2"]);
  });

  it("活跃任务只包含排队/运行/待确认", () => {
    makeJob("j1", "u1");
    updateJob("j1", { status: "cancelled" });
    expect(listActiveJobs("u1")).toEqual([]);

    makeJob("j2", "u1");
    expect(listActiveJobs("u1").map((j) => j.id)).toEqual(["j2"]);
  });
});

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
    expect(details.dedupe).toBe("跳过 0 道重复题");
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

describe("本地兜底的题不会被自己的判重吃掉", () => {
  it("12 道模板题两两不重复,一道都不被跳过", () => {
    const { kept, skipped } = dedupeWithinSet(buildLocalQuestions(scanResume(RESUME)));
    expect(skipped).toBe(0);
    expect(kept).toHaveLength(12);
  });
});

/* ─── 8. 组件层 ───────────────────────────────────────────────────── */

const RESUME_ITEMS = [
  { id: "r1", title: "后端工程师简历", template: "classic", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "r2", title: "产品经理简历", template: "classic", updatedAt: "2026-02-01T00:00:00.000Z" },
];

function makeJobSummary(overrides: Partial<InterviewJobSummary> = {}): InterviewJobSummary {
  return {
    id: "iv_1",
    userId: "u1",
    status: "running",
    title: "后端工程师简历",
    source: { kind: "resume", resumeId: "r1" },
    stages: [
      { key: "scan", status: "done", detail: "识别到 3 个技能 · 2 段项目" },
      { key: "generate", status: "running" },
    ],
    progress: 0.3,
    currentStage: "generate",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

interface Route {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => { status?: number; body: unknown };
}

function mockFetch(routes: Route[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    for (const r of routes) {
      if (r.match(url, init)) {
        const { status = 200, body } = r.respond(url, init);
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  });
}

let savedKey: string | undefined;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  clearJobs();
  // 明确走本地兜底路径 —— 用例不该依赖开发机有没有配密钥
  savedKey = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
  else process.env.MINIMAX_API_KEY = savedKey;
});

/**
 * 这个文件是 `.ts`,不能写 JSX —— 组件用 createElement 摆出来。
 * (测试文件名是既有约定,不改扩展名。)
 */
const h = createElement;

describe("SourcePicker", () => {
  it("列出历史简历", () => {
    render(h(SourcePicker, { resumes: RESUME_ITEMS, busy: false, onStart: () => {} }));
    expect(screen.getByRole("button", { name: /后端工程师简历/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /产品经理简历/ })).toBeTruthy();
  });

  it("没有简历时给出提示", () => {
    render(h(SourcePicker, { resumes: [], busy: false, onStart: () => {} }));
    expect(screen.getByText(/还没有简历/)).toBeTruthy();
  });

  it("点「开始押题」把选中的简历交出去", () => {
    const onStart = vi.fn();
    render(h(SourcePicker, { resumes: RESUME_ITEMS, busy: false, onStart }));
    fireEvent.click(screen.getByRole("button", { name: /产品经理简历/ }));
    fireEvent.click(screen.getByRole("button", { name: "开始押题" }));
    expect(onStart).toHaveBeenCalledWith({ kind: "resume", resumeId: "r2" });
  });
});

describe("ProgressPanel", () => {
  it("五个节点都在,带各自的一句话结果", () => {
    render(h(ProgressPanel, { job: makeJobSummary(), onDiscard: () => {} }));
    for (const title of ["简历扫描", "出题", "查重", "出答案", "待确认入库"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("识别到 3 个技能 · 2 段项目")).toBeTruthy();
  });

  it("进度条带百分比", () => {
    render(h(ProgressPanel, { job: makeJobSummary({ progress: 0.3 }), onDiscard: () => {} }));
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("30");
  });
});

describe("InterviewWorkspace", () => {
  it("一进来就接管还在跑的任务 —— 切页回来进度不丢", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          match: (u) => u === "/api/interview",
          respond: () => ({ body: { jobs: [makeJobSummary()] } }),
        },
      ]),
    );
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByText("简历扫描")).toBeTruthy());
  });

  it("提交后接口立刻返回,进度界面马上出现", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          match: (u, i) => u === "/api/interview" && i?.method === "POST",
          respond: () => ({ status: 202, body: { job: makeJobSummary() } }),
        },
        { match: (u) => u === "/api/interview", respond: () => ({ body: { jobs: [] } }) },
      ]),
    );
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开始押题" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "开始押题" }));
    await waitFor(() => expect(screen.getByText("简历扫描")).toBeTruthy());
  });

  it("跑完展示题卡:题干常显、答案收起、按难度升序", async () => {
    const questions: InterviewQuestion[] = [
      { question: "第四档题", topic: "t4", category: "deep", difficulty: 4, answer: "答案四" },
      { question: "第一档题", topic: "t1", category: "basic", difficulty: 1, answer: "答案一" },
      { question: "第三档题", topic: "t3", category: "deep", difficulty: 3, answer: "答案三" },
    ];
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          match: (u) => u === "/api/interview",
          respond: () => ({
            body: {
              jobs: [
                makeJobSummary({ status: "awaiting-confirm", progress: 1, stages: [], questions }),
              ],
            },
          }),
        },
      ]),
    );
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByText("第一档题")).toBeTruthy());

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("第一档题");
    expect(cards[1].textContent).toContain("第三档题");
    expect(cards[2].textContent).toContain("第四档题");

    // 答案默认收起 —— 一个字都不在 DOM 里
    expect(screen.queryByText("答案一")).toBeNull();
  });

  it("兜底模式会明确标注出来", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          match: (u) => u === "/api/interview",
          respond: () => ({
            body: {
              jobs: [
                makeJobSummary({
                  status: "awaiting-confirm",
                  progress: 1,
                  stages: [],
                  engineNote: LOCAL_ENGINE_NOTE,
                }),
              ],
            },
          }),
        },
      ]),
    );
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByText(/本地兜底/)).toBeTruthy());
  });

  it("题卡可以勾「重点关注」", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          match: (u) => u === "/api/interview",
          respond: () => ({
            body: {
              jobs: [
                makeJobSummary({
                  status: "awaiting-confirm",
                  progress: 1,
                  stages: [],
                  questions: [
                    { question: "第一档题", topic: "t1", category: "basic", difficulty: 1, answer: "答案一" },
                  ],
                }),
              ],
            },
          }),
        },
      ]),
    );
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重点关注" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "重点关注" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消重点关注" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
  });

  it("「再押一套」回到来源选择,但不把上一套题删掉", async () => {
    const fetchMock = mockFetch([
      {
        match: (u) => u === "/api/interview",
        respond: () => ({
          body: {
            jobs: [
              makeJobSummary({
                status: "awaiting-confirm",
                progress: 1,
                stages: [],
                questions: [
                  { question: "第一档题", topic: "t1", category: "basic", difficulty: 1, answer: "答案一" },
                ],
              }),
            ],
          },
        }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    render(h(InterviewWorkspace, { resumes: RESUME_ITEMS }));
    await waitFor(() => expect(screen.getByText("第一档题")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "再押一套" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开始押题" })).toBeTruthy());

    // 这一版还没入库,题目只在内存里 —— 一删就再也看不回来了
    const deleted = fetchMock.mock.calls.some(
      ([u, i]) => String(u).includes("/api/interview/") && (i as RequestInit)?.method === "DELETE",
    );
    expect(deleted).toBe(false);
  });
});
