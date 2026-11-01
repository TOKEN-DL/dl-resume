// @vitest-environment jsdom
/**
 * QuestionBank —— 我的题库(按批次分组 / 收藏 / 删除 / 筛选同步到 URL)。
 *
 * 盯六件事:
 *   1. 按**批次**分组:组头显示来源简历、生成时间、题数
 *   2. 每道题都用共用的题卡渲染(题干常显、答案折叠)
 *   3. 收藏切换立刻生效,并回写接口
 *   4. 能删单题、删整套;删完整套后该组消失
 *   5. 顶部「再押一套」指向 /interview
 *   6. 空题库给提示,不白屏
 *   7. 筛选条件反映到 URL 上:刷新能恢复、非法值不崩、改筛选不进历史
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QuestionBank } from "./question-bank";

const fetchMock = vi.fn();

/**
 * next/navigation 的替身。
 *
 * searchParams 做成可变的:组件从它读初始筛选条件,
 * 测试要能改它来模拟「刷新页面 / 带参数打开链接」。
 *
 * replace 照着真 router 的样子来 —— 改 URL、然后让 useSearchParams 返回新值,
 * 不然测不出「URL → state」那一趟。
 */
const nav = vi.hoisted(() => {
  const state = {
    searchParams: new URLSearchParams(),
    pathname: "/questions",
    replace: vi.fn(),
    push: vi.fn(),
  };
  // 照着真 router 的样子:replace 改 URL,useSearchParams 下次渲染就能拿到新值
  state.replace.mockImplementation((url: string) => {
    const raw = String(url).split("?")[1] ?? "";
    state.searchParams = new URLSearchParams(raw);
  });
  return state;
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.searchParams,
  usePathname: () => nav.pathname,
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const SET_A = {
  id: "qs_1",
  resumeId: "res_1",
  resumeTitle: "后端工程师简历",
  provider: "minimax",
  // 正午 UTC —— 换时区也还是同一天,断言日期不会飘
  createdAt: "2026-11-01T12:00:00.000Z",
  count: 2,
};

const SET_B = {
  id: "qs_2",
  resumeId: "res_2",
  resumeTitle: "前端工程师简历",
  provider: "local",
  createdAt: "2026-10-20T12:00:00.000Z",
  count: 1,
};

const ITEM_1 = {
  id: "qi_1",
  setId: "qs_1",
  resumeId: "res_1",
  resumeTitle: "后端工程师简历",
  question: "介绍一下 RAG 的召回策略",
  answer: "BM25 + 向量混合召回,RRF 融合。",
  topic: "RAG 召回策略",
  category: "basic",
  difficulty: 2,
  starred: false,
  createdAt: "2026-11-01T12:00:00.000Z",
};

const ITEM_2 = {
  id: "qi_2",
  setId: "qs_1",
  resumeId: "res_1",
  resumeTitle: "后端工程师简历",
  question: "讲讲向量索引 HNSW 的原理",
  answer: "分层可导航小世界图,贪心搜索 + 双向队列。",
  topic: "向量索引",
  category: "deep",
  difficulty: 4,
  starred: false,
  createdAt: "2026-11-01T12:00:00.000Z",
};

const ITEM_3 = {
  id: "qi_3",
  setId: "qs_2",
  resumeId: "res_2",
  resumeTitle: "前端工程师简历",
  question: "React 18 的并发特性怎么用",
  answer: "useTransition + Suspense,渲染可中断。",
  topic: "React 并发",
  category: "basic",
  difficulty: 3,
  starred: true,
  createdAt: "2026-10-20T12:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 装一个假的 fetch。
 * GET 返回列表;PATCH / DELETE 按方法分派,并把调用记录下来供断言。
 */
function installFetch(opts: { items?: unknown[]; sets?: unknown[] } = {}) {
  const items = opts.items ?? [ITEM_1, ITEM_2];
  const sets = opts.sets ?? [SET_A];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return jsonResponse({ items, total: items.length, sets });
    }
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { starred: boolean };
      const id = url.split("/").pop() ?? "";
      const target = items.find((i) => (i as { id: string }).id === id);
      return jsonResponse({
        item: { ...(target ?? {}), starred: body.starred },
      });
    }
    if (method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: "unsupported" }, 400);
  });
}

/** 取所有 fetch 调用里某个方法 / 某个 url 的那一发 */
function callOf(method: string, urlPart: string) {
  return fetchMock.mock.calls.find(
    ([u, init]) =>
      (init as RequestInit | undefined)?.method?.toUpperCase() === method &&
      String(u).includes(urlPart),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  nav.searchParams = new URLSearchParams();
  nav.replace.mockClear();
  nav.push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuestionBank", () => {
  it("按批次分组:组头显示来源简历、生成时间、题数", async () => {
    installFetch({ items: [ITEM_1, ITEM_2, ITEM_3], sets: [SET_A, SET_B] });
    render(<QuestionBank />);

    // 两套各一个组(来源简历就是组名)
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "后端工程师简历" })).toBeTruthy(),
    );
    const g1 = screen.getByRole("region", { name: "后端工程师简历" });
    const g2 = screen.getByRole("region", { name: "前端工程师简历" });

    // 组头:来源简历 + 生成时间 + 题数
    expect(within(g1).getByRole("heading", { level: 2 }).textContent).toBe("后端工程师简历");
    expect(g1.querySelector("time")?.getAttribute("datetime")).toBe(SET_A.createdAt);
    expect(within(g1).getByText("2 题")).toBeTruthy();

    expect(g2.querySelector("time")?.getAttribute("datetime")).toBe(SET_B.createdAt);
    expect(within(g2).getByText("1 题")).toBeTruthy();
  });

  it("每道题都渲染成题卡:题干可见、答案默认收起", async () => {
    installFetch({ items: [ITEM_1, ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_1.question)).toBeTruthy());
    expect(screen.getByText(ITEM_2.question)).toBeTruthy();
    // 答案没点开就不在 DOM 里
    expect(screen.queryByText(ITEM_1.answer)).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "看参考答案" })[0]);
    expect(screen.getByText(ITEM_1.answer)).toBeTruthy();
  });

  it("顶部有「再押一套」入口,指向 /interview", async () => {
    installFetch();
    render(<QuestionBank />);

    const link = screen.getByRole("link", { name: "再押一套" });
    expect(link.getAttribute("href")).toBe("/interview");
  });

  it("空题库给提示,不白屏", async () => {
    installFetch({ items: [], sets: [] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText("题库还是空的")).toBeTruthy());
    // 空状态里也留着去押题的入口
    expect(screen.getByRole("link", { name: "去押一套" })).toBeTruthy();
  });

  it("收藏:点一下立刻变成「取消收藏」,并回写接口", async () => {
    installFetch({ items: [ITEM_1, ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_1.question)).toBeTruthy());
    const star = screen.getAllByRole("button", { name: "收藏" })[0];
    fireEvent.click(star);

    // 乐观更新:不等接口回来,按钮先翻过来
    expect(screen.getAllByRole("button", { name: "取消收藏" })).toHaveLength(1);

    await waitFor(() => {
      const call = callOf("PATCH", "/api/questions/qi_1");
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ starred: true });
    });
  });

  it("取消收藏:回写 starred:false", async () => {
    installFetch({ items: [{ ...ITEM_3, setId: "qs_2" }], sets: [SET_B] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_3.question)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));

    await waitFor(() => {
      const call = callOf("PATCH", "/api/questions/qi_3");
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ starred: false });
    });
  });

  it("删单题:题目从列表消失,组头题数减一", async () => {
    installFetch({ items: [ITEM_1, ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_1.question)).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "删掉这道题" })[0]);

    await waitFor(() => expect(screen.queryByText(ITEM_1.question)).toBeNull());
    expect(screen.getByText(ITEM_2.question)).toBeTruthy();
    expect(screen.getByText("1 题")).toBeTruthy();

    const call = callOf("DELETE", "/api/questions/qi_1");
    expect(call).toBeTruthy();
  });

  it("删整套:整组消失,回到空状态", async () => {
    installFetch({ items: [ITEM_1, ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_1.question)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "删掉这套" }));

    await waitFor(() => expect(screen.getByText("题库还是空的")).toBeTruthy());
    expect(screen.queryByText(ITEM_1.question)).toBeNull();

    const call = callOf("DELETE", "/api/questions?setId=qs_1");
    expect(call).toBeTruthy();
  });

  it("筛选:勾「仅看收藏」后请求带上 starred=true", async () => {
    installFetch({ items: [ITEM_3], sets: [SET_B] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_3.question)).toBeTruthy());
    fireEvent.click(screen.getByLabelText("仅看收藏"));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) =>
        String(u).includes("/api/questions?") && String(u).includes("starred=true"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("筛选:选分类后请求带上 category=deep", async () => {
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "deep" } });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) =>
        String(u).includes("/api/questions?") && String(u).includes("category=deep"),
      );
      expect(call).toBeTruthy();
    });
  });
});

/**
 * 筛选条件 ↔ URL 同步。
 *
 * 规则:
 *   1. 初始筛选条件从 URL 的 query string 里读(刷新页面不丢)
 *   2. 改筛选条件 → router.replace 写回 URL(不是 push,不往历史里塞)
 *   3. URL 里的非法值当没给(回退默认值),页面不崩
 */
describe("QuestionBank 的 URL 同步", () => {
  it("初始筛选条件从 URL 恢复:刷新后不重置成默认", async () => {
    nav.searchParams = new URLSearchParams(
      "resumeId=res_1&category=deep&difficulty=4&starred=true&q=RAG",
    );
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    // 控件的选中态跟着 URL 走
    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    expect((screen.getByLabelText("来源简历") as HTMLSelectElement).value).toBe("res_1");
    expect((screen.getByLabelText("分类") as HTMLSelectElement).value).toBe("deep");
    expect((screen.getByLabelText("难度") as HTMLSelectElement).value).toBe("4");
    expect((screen.getByLabelText("仅看收藏") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("关键词") as HTMLInputElement).value).toBe("RAG");

    // 第一次请求就带着 URL 上的条件
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/questions?"));
      expect(String(call?.[0])).toContain("category=deep");
      expect(String(call?.[0])).toContain("difficulty=4");
      expect(String(call?.[0])).toContain("starred=true");
      expect(String(call?.[0])).toContain("q=RAG");
    });
  });

  it("改筛选条件 → URL 的 query string 跟着变", async () => {
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "deep" } });

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith(
        "/questions?category=deep",
        expect.objectContaining({ scroll: false }),
      );
    });
  });

  it("多个筛选条件叠加 → URL 上都带着", async () => {
    installFetch({ items: [ITEM_3], sets: [SET_B] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_3.question)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "deep" } });
    fireEvent.click(screen.getByLabelText("仅看收藏"));
    fireEvent.change(screen.getByLabelText("难度"), { target: { value: "3" } });

    await waitFor(() => {
      const last = nav.replace.mock.calls.at(-1);
      expect(String(last?.[0])).toContain("category=deep");
      expect(String(last?.[0])).toContain("difficulty=3");
      expect(String(last?.[0])).toContain("starred=true");
    });
  });

  it("改筛选用 replace 而不是 push:不往浏览器历史里塞记录", async () => {
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "deep" } });

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
    // scroll:false —— 改筛选不该让页面跳回顶部
    expect(nav.replace.mock.calls.at(-1)?.[1]).toMatchObject({ scroll: false });
  });

  it("清空筛选 → URL 回到干净的路径", async () => {
    nav.searchParams = new URLSearchParams("category=deep");
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "" } });

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith(
        "/questions",
        expect.objectContaining({ scroll: false }),
      );
    });
  });

  it("URL 里的非法值当没给:页面不崩,回退成默认值", async () => {
    // difficulty=99 超出 1~4,category=nope 不是 basic/deep,starred=maybe 不是布尔
    nav.searchParams = new URLSearchParams(
      "category=nope&difficulty=99&starred=maybe&resumeId=",
    );
    installFetch({ items: [ITEM_1], sets: [SET_A] });
    render(<QuestionBank />);

    // 页面照常渲染,控件回到默认
    await waitFor(() => expect(screen.getByText(ITEM_1.question)).toBeTruthy());
    expect((screen.getByLabelText("分类") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("难度") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("仅看收藏") as HTMLInputElement).checked).toBe(false);

    // 请求里也不能带非法值(接口对非法值直接 400)
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).not.toContain("category=");
    expect(url).not.toContain("difficulty=");
    expect(url).not.toContain("starred=");
  });

  it("URL 变化 → 筛选状态跟着更新(不写回 URL,避免死循环)", async () => {
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    const { rerender } = render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    nav.replace.mockClear();

    // 模拟用户手动改地址栏 / 前进后退:URL 变了,筛选要跟上
    nav.searchParams = new URLSearchParams("category=deep");
    rerender(<QuestionBank />);

    await waitFor(() => {
      expect((screen.getByLabelText("分类") as HTMLSelectElement).value).toBe("deep");
    });
    // URL → state 这一趟不该反过来再写一次 URL
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("改筛选只重新拉一次数据(URL 那一趟不重复拉)", async () => {
    installFetch({ items: [ITEM_2], sets: [SET_A] });
    render(<QuestionBank />);

    await waitFor(() => expect(screen.getByText(ITEM_2.question)).toBeTruthy());
    const before = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "deep" } });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes("category=deep"));
      expect(call).toBeTruthy();
    });
    // 等 URL 那一趟也跑完
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    // 只多了一次请求 —— 自己写进去的 URL 回来时不该再拉一遍
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });
});
