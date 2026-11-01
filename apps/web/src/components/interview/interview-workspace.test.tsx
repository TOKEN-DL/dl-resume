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

const fetchMock = vi.fn();

/** 原始顺序:下标 0 是深挖题,下标 1 是基础题(题卡按难度升序排,基础题会显示在前) */
const QUESTIONS = [
  { question: "深挖题", answer: "A", topic: "T1", category: "deep", difficulty: 3 },
  { question: "基础题", answer: "B", topic: "T2", category: "basic", difficulty: 1 },
];

/** 一个跑完、等着确认的任务 */
function job() {
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
  };
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
function installFetch() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/interview") return jsonResponse({ jobs: [job()] });
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
