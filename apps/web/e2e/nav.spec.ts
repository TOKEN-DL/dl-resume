/**
 * 顶栏导航 —— 端到端验证。
 *
 * 两件事:
 *   1. 六个模块都在,「我的题库」指向 /questions,当前页带激活态
 *   2. 窄屏顶栏不横向溢出,六个入口一个都不被切掉
 *
 * 第 2 条是加「我的题库」时挖出来的坑:六个入口 + 品牌 + 账号区挤在一行,
 * 窄屏放不下就会把顶栏撑破 —— 右侧的账号胶囊被切掉,整页也跟着能横向拖。
 * (基线在 360px 就已经溢出 36px,加了「我的题库」后更严重。)
 * 修法是 ≤560px 把顶栏拆成两行:第一行品牌 + 账号,第二行整条主导航独占一行。
 * 这条断言就是防它再退化回去 —— 只靠 jsdom 单测看不出布局,得用真浏览器量。
 */
import { expect, test } from "@playwright/test";

/** 六个模块 → 目标路径 */
const NAV_LINKS = [
  { name: "首页", href: "/" },
  { name: "模板广场", href: "/templates" },
  { name: "智能优化", href: "/optimize" },
  { name: "面试押题", href: "/interview" },
  { name: "我的题库", href: "/questions" },
  { name: "我的简历", href: "/resumes" },
];

/**
 * 要盯的视口宽度 —— 每个断点两侧都取一个:
 * 1024 / 900(拆行点,900 与 901 分属两种布局)/ 720 / 480 / 400(字号收紧点)/ 320。
 * e2e 的 storageState 是**登录态**,顶栏会多出 ADMIN 标签和账号胶囊 ——
 * 那是最挤的情况,必须按登录态量,不然测出来的数字没意义。
 */
const WIDTHS = [320, 360, 375, 390, 414, 480, 560, 640, 720, 768, 820, 900, 901, 1024, 1280];

test.describe("顶栏导航", () => {
  test("六个模块都在,各自指向该去的页面", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await expect(nav.getByRole("link")).toHaveCount(NAV_LINKS.length);

    for (const item of NAV_LINKS) {
      await expect(nav.getByRole("link", { name: item.name })).toHaveAttribute("href", item.href);
    }
  });

  test("从顶栏点进「我的题库」,到达题库页且只有它带激活态", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });

    await nav.getByRole("link", { name: "我的题库" }).click();
    await expect(page).toHaveURL(/\/questions$/);

    await expect(nav.getByRole("link", { name: "我的题库" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // 激活态只落在当前页上,别的一律没有
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test("窄屏顶栏不横向溢出,六个入口一个都不被切掉", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.reload();

      const m = await page.evaluate(() => {
        const bar = document.querySelector('[data-nav="bar"]') as HTMLElement | null;
        const links = document.querySelector('nav[aria-label="主导航"]') as HTMLElement | null;
        if (!bar || !links) return null;
        const vw = document.documentElement.clientWidth;
        const anchors = Array.from(links.querySelectorAll("a")) as HTMLElement[];
        return {
          /** 顶栏自身撑出去多少(内部溢出) */
          barOverflow: bar.scrollWidth - bar.clientWidth,
          /** 整页能横向拖多少 */
          docOverflow: document.documentElement.scrollWidth - vw,
          /** 被切到屏幕右边的导航项 */
          clipped: anchors
            .filter((el) => el.getBoundingClientRect().right > vw + 0.5)
            .map((el) => el.textContent?.trim()),
          count: anchors.length,
        };
      });

      expect(m, `${width}px 宽度下没找到顶栏`).not.toBeNull();
      expect(m!.barOverflow, `${width}px 宽度下顶栏内部溢出`).toBeLessThanOrEqual(0);
      expect(m!.docOverflow, `${width}px 宽度下整页能横向拖`).toBeLessThanOrEqual(0);
      expect(m!.clipped, `${width}px 宽度下有导航项被切掉`).toEqual([]);
      expect(m!.count, `${width}px 宽度下导航项数量不对`).toBe(NAV_LINKS.length);
    }
  });
});
