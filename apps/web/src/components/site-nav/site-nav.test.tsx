// @vitest-environment jsdom
/**
 * SiteNav —— 全站顶栏。
 *
 * 重点盯三件事:
 *   1. 四个模块(首页 / 模板广场 / 智能优化 / 我的简历)都在,当前页有激活态
 *   2. 「我的简历」的下拉里有一块**显眼的实心「创建简历」按钮**
 *   3. 未登录时点「创建简历」去登录页;已登录时建简历并跳编辑器
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SiteNav } from "./site-nav";

const nav = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));

beforeEach(() => {
  nav.pathname = "/";
  nav.push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 展开「我的简历」下拉 */
function openMenu() {
  fireEvent.click(screen.getByLabelText("展开我的简历菜单"));
}

describe("SiteNav", () => {
  it("渲染出四个模块:首页 / 模板广场 / 智能优化 / 我的简历", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "首页" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "模板广场" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "智能优化" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "我的简历" })).toBeTruthy();
  });

  it("「智能优化」指向 /optimize,✦ 标记不进无障碍名", () => {
    render(<SiteNav />);
    const link = screen.getByRole("link", { name: "智能优化" });
    expect(link.getAttribute("href")).toBe("/optimize");
    // ✦ 是装饰,aria-hidden 之后链接的可读名仍只有「智能优化」
    expect(link.textContent).toContain("✦");
  });

  it("在 /optimize 上时「智能优化」带激活态", () => {
    nav.pathname = "/optimize";
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "智能优化" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "首页" }).getAttribute("aria-current")).toBeNull();
  });

  it("当前页的导航项带 aria-current=page", () => {
    nav.pathname = "/templates";
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "模板广场" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "首页" }).getAttribute("aria-current")).toBeNull();
  });

  it("下拉默认收起,展开后第一项就是「创建简历」", () => {
    render(<SiteNav />);
    expect(screen.queryByRole("menu")).toBeNull();

    openMenu();

    const menu = screen.getByRole("menu");
    expect(menu).toBeTruthy();
    const items = screen.getAllByRole("menuitem");
    expect(items[0].textContent).toContain("创建简历");
  });

  it("「创建简历」是一块实心主按钮(有独立的 class,可与普通菜单项区分)", () => {
    render(<SiteNav />);
    openMenu();
    const create = screen.getByRole("menuitem", { name: /创建简历/ });
    expect(create.tagName).toBe("BUTTON");
    // 普通菜单项是 div/button 混排,主按钮必须自带样式钩子
    expect(create.className).toMatch(/create/i);
  });

  it("下拉里列出最近编辑的简历", () => {
    render(
      <SiteNav
        email="a@b.com"
        recent={[
          { id: "r1", title: "后端工程师简历", updatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "r2", title: "产品经理简历", updatedAt: "2026-02-01T00:00:00.000Z" },
        ]}
      />,
    );
    openMenu();
    expect(screen.getByText("最近编辑")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /后端工程师简历/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /产品经理简历/ })).toBeTruthy();
  });

  it("未登录时点「创建简历」把人送去登录页", async () => {
    render(<SiteNav />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /创建简历/ }));
    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/login?next=/resumes");
    });
  });

  it("已登录时点「创建简历」建好简历并跳编辑器", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/resumes" && init?.method === "POST") {
        return new Response(JSON.stringify({ resume: { id: "new1" } }), { status: 201 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SiteNav email="a@b.com" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /创建简历/ }));

    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith("/resumes/new1/edit");
    });
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/resumes");
    expect(call).toBeTruthy();
    expect(JSON.parse(String((call![1] as RequestInit).body)).title).toBe("未命名简历");

    vi.unstubAllGlobals();
  });

  it("鼠标悬停展开下拉;此时再点 caret 是「钉住」而不是立刻关掉", () => {
    render(<SiteNav />);
    const link = screen.getByRole("link", { name: "我的简历" });
    const group = link.parentElement?.parentElement;
    expect(group).toBeTruthy();

    fireEvent.mouseEnter(group!);
    expect(screen.queryByRole("menu")).toBeTruthy();

    // hover 已经把菜单打开了,再点一次 caret 不该把它关掉
    fireEvent.click(screen.getByLabelText("展开我的简历菜单"));
    expect(screen.queryByRole("menu")).toBeTruthy();

    // 钉住之后,鼠标移开也还开着;再点 caret 才收起
    fireEvent.mouseLeave(group!);
    expect(screen.queryByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("展开我的简历菜单"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("已登录时显示账号区,未登录时显示登录入口", () => {
    const { unmount } = render(<SiteNav email="me@example.com" />);
    expect(screen.getByText("me@example.com")).toBeTruthy();
    unmount();

    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "登录" })).toBeTruthy();
  });
});
