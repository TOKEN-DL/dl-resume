// @vitest-environment jsdom
/**
 * InterviewWorkspace —— 押题工作台的「确认入库」这一段。
 *
 * 盯五件事:
 *   1. 底部有「确认入库题库」按钮
 *   2. 二次确认层如实显示入库题数与跳过的重复题数
 *   3. 取消不写库,任务还能再确认
 *   4. 「重点关注」按**原始题序**传上去(题卡按难度排过,显示位置 ≠ 原始下标)
 *   5. 入库后提示「已入库 N 题 → 去题库」,链接指向 /questions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { InterviewWorkspace } from "./interview-workspace";
import { LOCAL_ENGINE_NOTE } from "@/lib/interview/generator";
import type { InterviewJobSummary, InterviewQuestion } from "@/lib/interview/types";

const fetchMock = vi.fn();

/** 原始顺序:下标 0 是深挖题,下标 1 是基础题(题卡按难度升序排,基础题会显示在前) */
const QUESTIONS = [
  { question: "深挖题", answer: "A", topic: "T1", category: "deep", difficulty: 3 },
  { question: "基础题", answer: "B", topic: "T2", category: "basic", difficulty: 1 },
];

/** 一个跑完、等着确认的任务 */
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "iv_1",
    userId: "u1",
    status: "awaiting-confirm",
    title: "简历",
    source: { kind: "resume", resumeId: "res_1" },
    stages: [],
    progress: 1,
    questions: QUESTIONS,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** 一个被判「整套高度重复」的任务 */
function duplicateJob() {
  return job({
    dedupe: {
      totalCount: 12,
      duplicateCount: 8,
      ratio: 8 / 12,
      threshold: 7,
      isDuplicate: true,
      matchedSet: { id: "qs_old", title: "后端工程师简历", createdAt: 1 },
      hits: [],
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 装一个假的 fetch。
 *
 * GET /api/interview 回一个「等确认」的任务(进页面就接上);
 * POST …/confirm 分两种:preview 只报数,真确认才回套 id。
 */
function installFetch(jobSummary: Record<string, unknown> = job()) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/interview") return jsonResponse({ jobs: [jobSummary] });
    if (u.includes("/confirm")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { preview?: boolean };
      if (body.preview) {
        return jsonResponse({ inserted: 2, skipped: 1, setId: null });
      }
      return jsonResponse({ inserted: 2, skipped: 1, setId: "qs_1" });
    }
    return jsonResponse({ error: "unsupported" }, 400);
  });
}

/** 取所有**真正写入**的请求(把预览那发排除掉) */
function confirmCalls() {
  return fetchMock.mock.calls.filter(([, init]) => {
    const b = (init as RequestInit | undefined)?.body;
    return typeof b === "string" && !JSON.parse(b).preview;
  });
}

/** 等页面接上那个「等确认」的任务 */
async function waitForResult() {
  await waitFor(() => expect(screen.getByText("押题完成")).toBeTruthy());
}

beforeEach(() => {
  fetchMock.mockReset();
  installFetch();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("押题页确认入库", () => {
  it("底部有「确认入库题库」按钮", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    expect(screen.getByRole("button", { name: "确认入库题库" })).toBeTruthy();
  });

  it("二次确认层如实显示入库题数与跳过的重复题数", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));

    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 1 题重复")).toBeTruthy());
    expect(screen.getByRole("button", { name: "确认入库" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
  });

  it("取消不写库,任务还能再确认", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));
    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 1 题重复")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmCalls()).toHaveLength(0);

    // 还能再打开、再确认
    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));
    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 1 题重复")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
  });

  it("「重点关注」按原始题序传上去(题卡按难度排过,显示位置 ≠ 原始下标)", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    // 排序后第一张卡是「基础题」= 原始下标 1
    const stars = screen.getAllByRole("button", { name: "重点关注" });
    fireEvent.click(stars[0]);

    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));
    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 1 题重复")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    const body = JSON.parse(String(confirmCalls()[0][1].body));
    expect(body.starredIndexes).toEqual([1]);
  });

  it("入库后提示「已入库 N 题 → 去题库」,链接指向 /questions", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));
    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 1 题重复")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() => expect(screen.getByText(/已入库 2 题/)).toBeTruthy());
    expect(screen.getByText(/跳过 1 道重复题/)).toBeTruthy();

    const link = screen.getByRole("link", { name: "去题库" });
    expect(link.getAttribute("href")).toBe("/questions");
    // 入库后按钮收起来,不能再点出第二份
    expect(screen.queryByRole("button", { name: "确认入库题库" })).toBeNull();
  });
});

/**
 * 跨套判重的拦截(#22)—— 整套高度重复时的提示条与逃生口。
 *
 * 盯三件事:
 *   1. 出现提示条,说清跟哪套重复、重复了几题
 *   2. 出现「仍要入库（只保留不重复的 N 题）」按钮
 *   3. 点它 → 带上 force 去写库(只写不重复的题)
 */
describe("押题页 · 整套高度重复", () => {
  beforeEach(() => {
    installFetch(duplicateJob());
  });

  it("出提示条,说清跟哪一套重复、重复了几题", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    expect(screen.getByText("这套与题库里已有的题高度重复")).toBeTruthy();
    expect(screen.getByText(/8 \/ 12 题/)).toBeTruthy();
    expect(screen.getByText(/后端工程师简历/)).toBeTruthy();
  });

  it("有「仍要入库（只保留不重复的 N 题）」按钮", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    expect(
      screen.getByRole("button", { name: "仍要入库（只保留不重复的 4 题）" }),
    ).toBeTruthy();
  });

  it("点「仍要入库」带上 force 去写库", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    fireEvent.click(
      screen.getByRole("button", { name: "仍要入库（只保留不重复的 4 题）" }),
    );

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    const body = JSON.parse(String(confirmCalls()[0][1].body));
    expect(body.force).toBe(true);
  });

  it("整套被拦时,普通「确认入库题库」按钮不出现", async () => {
    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    expect(screen.queryByRole("button", { name: "确认入库题库" })).toBeNull();
  });

  it("入库时服务端才判定整套重复:关掉确认层,提示条接管", async () => {
    // 预览说没问题,真确认的时候服务端说整套重复
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/interview") return jsonResponse({ jobs: [job()] });
      if (u.includes("/confirm")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { preview?: boolean };
        if (body.preview) return jsonResponse({ inserted: 2, skipped: 0, setId: null });
        return jsonResponse(
          {
            error: "set_duplicate",
            duplicateCount: 2,
            totalCount: 2,
            matchedSet: { id: "qs_old", title: "旧简历", createdAt: 1 },
          },
          409,
        );
      }
      return jsonResponse({ error: "unsupported" }, 400);
    });

    render(<InterviewWorkspace resumes={[]} />);
    await waitForResult();

    fireEvent.click(screen.getByRole("button", { name: "确认入库题库" }));
    await waitFor(() => expect(screen.getByText("2 题入库 / 跳过 0 题重复")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /仍要入库/ })).toBeTruthy(),
    );
    // 确认层关掉,提示条露出来
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * 工作台的流程 —— 选来源 → 跑进度 → 看题卡。
 *
 * 盯六件事:
 *   1. 一进来就接管还在跑的任务 —— 切页回来进度不丢
 *   2. 提交后接口立刻返回,进度界面马上出现
 *   3. 跑完展示题卡:题干常显、答案收起、按难度升序
 *   4. 兜底模式会明确标注出来
 *   5. 题卡可以勾「重点关注」
 *   6. 「再押一套」回到来源选择,但不把上一套题删掉
 */
describe("InterviewWorkspace · 流程", () => {
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

  /** 装一个假的 fetch:按路由表回响应,没匹配上的回 404 */
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
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
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
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
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
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
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
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
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
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "重点关注" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "重点关注" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消重点关注" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
  });

  it("「再押一套」回到来源选择,但不把上一套题删掉", async () => {
    const flowFetch = mockFetch([
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
    vi.stubGlobal("fetch", flowFetch);
    render(<InterviewWorkspace resumes={RESUME_ITEMS} />);
    await waitFor(() => expect(screen.getByText("第一档题")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "再押一套" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开始押题" })).toBeTruthy());

    // 这一版还没入库,题目只在内存里 —— 一删就再也看不回来了
    const deleted = flowFetch.mock.calls.some(
      ([u, i]) => String(u).includes("/api/interview/") && (i as RequestInit)?.method === "DELETE",
    );
    expect(deleted).toBe(false);
  });
});
