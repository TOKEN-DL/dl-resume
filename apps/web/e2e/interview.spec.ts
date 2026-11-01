/**
 * #25 面试押题 —— 端到端全链路验证。
 *
 * 一条完整的旅程,七步:
 *   1. 未登录访问押题页 / 题库页 → 被引导去登录
 *   2. 选简历 → 发起押题 → 进度推进 → 看到 12 道题
 *   3. 展开参考答案;刷新后折叠态的答案**不在 DOM 里**
 *   4. 标记「重点关注」→ 入库 → 题库可见且已是收藏
 *   5. 收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题
 *   6. 题库筛选可用:条件写进 URL,刷新不丢
 *   7. 同一份简历再押一次 → 整套高度重复 → 强行入库也不新增题
 *
 * 第 7 步是这个特性的意义所在:**再押一次不会让题库虚增**。
 * 它能成立靠的是种子简历的技能池恰好 6 个(12 % 6 = 0),
 * 第二轮出的 12 道题跟第一轮一模一样,于是跨套判重真的会被触发。
 *
 * 用例之间有前后依赖(第一轮的结果是第二轮的前提),所以整组串行跑。
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/** 种子简历标题 */
const RESUME_TITLE = "E2E 测试简历";
/** 一次押题的题数 */
const QUESTION_COUNT = 12;
/** 种子简历的技能池恰好 6 个 → 基础 / 深挖各 6 道 */
const DEEP_COUNT = 6;
/** 每档难度 3 道 */
const DIFFICULTY_3_COUNT = 3;
/** 技能池 6 个、模板 12 槽位 → 每个技能落在 2 道题里 */
const KEYWORD_HIT_COUNT = 2;

/** 题卡 —— 共用的题卡组件根节点是 <article> */
function cards(page: Page): Locator {
  return page.locator("article");
}

/** 题卡的题干 —— 题卡里唯一的 <p> 就是题干(答案是 div,且折叠时不在 DOM 里) */
function questionText(card: Locator): Locator {
  return card.locator(":scope > p");
}

/**
 * 等收藏回写(PATCH)落地。
 *
 * 收藏是「乐观更新 + 异步回写」:点完按钮界面先变,请求还在路上。
 * 后面要刷新页面的话**必须**先等它落地 —— 否则刷新会把没写完的改动冲掉,
 * 页面回到旧状态,断言就会对着一个假象较劲。
 */
function waitStarPersisted(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) =>
      r.url().includes("/api/questions/") && r.request().method() === "PATCH",
    { timeout: 20_000 },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("面试押题全链路", () => {
  /* ────────────────────────────────────────────────────────────
   * 1. 未登录 → 被引导去登录
   * ──────────────────────────────────────────────────────────── */
  test("未登录访问押题页与题库页,都被引导去登录", async ({ browser }) => {
    // 显式造一个不带登录态的上下文
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("/interview");
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page).toHaveURL(/next=.*interview/);

    await page.goto("/questions");
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page).toHaveURL(/next=.*questions/);

    await context.close();
  });

  /* ────────────────────────────────────────────────────────────
   * 2. 选简历 → 押题 → 进度推进 → 12 道题
   * ──────────────────────────────────────────────────────────── */
  test("选简历 → 发起押题 → 进度推进 → 看到 12 道题", async ({ page }) => {
    await page.goto("/interview");

    // 选简历:第一项默认选中
    const resumeBtn = page.getByRole("button", { name: RESUME_TITLE });
    await expect(resumeBtn).toBeVisible();
    await expect(resumeBtn).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "开始押题" }).click();

    // 进度面板出现
    await expect(page.getByRole("progressbar")).toBeVisible();
    // 出现过「进行中」的节点
    await expect(page.locator('li[data-status="running"]').first()).toBeVisible();
    // 节点推进:扫描节点从「进行中」走到「已完成」
    await expect(page.locator('li[data-stage="scan"][data-status="done"]')).toBeVisible();

    // 走到结果页
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/共 12 道题/)).toBeVisible();

    // 12 张题卡
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);
    await expect(page.getByRole("button", { name: "看参考答案" })).toHaveCount(QUESTION_COUNT);

    // 走的是本地兜底模板引擎(空 MINIMAX_API_KEY)—— 确定性、可重复
    await expect(page.getByText(/本地兜底/)).toBeVisible();
  });

  /* ────────────────────────────────────────────────────────────
   * 3. 展开答案;折叠态的答案整段不在 DOM 里
   * ──────────────────────────────────────────────────────────── */
  test("展开一道题的参考答案;刷新后答案仍默认收起", async ({ page }) => {
    await page.goto("/interview");
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible();

    const first = cards(page).first();
    await first.getByRole("button", { name: "看参考答案" }).click();

    const answer = first.getByRole("region", { name: "参考答案" });
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("答题要点");

    // 刷新:答案区**整段不在 DOM 里**,不是「藏起来但还在」
    await page.reload();
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible();
    await expect(page.getByRole("region", { name: "参考答案" })).toHaveCount(0);
  });

  /* ────────────────────────────────────────────────────────────
   * 4. 标记重点关注 → 入库 → 题库可见且已是收藏
   * ──────────────────────────────────────────────────────────── */
  test("标记重点关注 → 入库 → 题库里可见且已是收藏", async ({ page }) => {
    await page.goto("/interview");
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible();

    // 第一张卡标记「重点关注」
    const first = cards(page).first();
    const focusBtn = first.getByRole("button", { name: "重点关注" });
    await expect(focusBtn).toHaveAttribute("aria-pressed", "false");
    await focusBtn.click();
    await expect(first.getByRole("button", { name: "取消重点关注" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 二次确认层
    await page.getByRole("button", { name: "确认入库题库" }).click();
    const dialog = page.getByRole("dialog", { name: "确认入库题库" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/12 题入库 \/ 跳过 0 题重复/)).toBeVisible();

    await dialog.getByRole("button", { name: "确认入库" }).click();

    // 入库回执
    await expect(page.getByText(/已入库 12 题/)).toBeVisible();

    // 去题库
    await page.getByRole("link", { name: "去题库" }).click();
    await expect(page).toHaveURL(/\/questions/);
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);
  });

  /* ────────────────────────────────────────────────────────────
   * 5. 收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题
   * ──────────────────────────────────────────────────────────── */
  test("收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题", async ({ page }) => {
    await page.goto("/questions");
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 入库时勾了「重点关注」的那道题,落库后就是收藏态 —— 全页只有一道是收藏
    await expect(page.getByRole("button", { name: "取消收藏" })).toHaveCount(1);

    // 先取消这一道的收藏,再收藏另一道 ——
    // 这样「仅看收藏」的过滤结果确定是 1 道,断言不会含糊
    const unstar = waitStarPersisted(page);
    await page.getByRole("button", { name: "取消收藏" }).click();
    await unstar;
    await expect(page.getByRole("button", { name: "取消收藏" })).toHaveCount(0);

    // 认人靠**题干文字**,不靠卡片位置
    const targetQuestion = (await questionText(cards(page)).allInnerTexts())[0];
    const target = cards(page).filter({ hasText: targetQuestion }).first();
    const star = waitStarPersisted(page);
    await target.getByRole("button", { name: "收藏", exact: true }).click();
    await star;

    // 收藏态落在哪一道题上,以页面上的事实为准(aria-pressed="true" 的那张卡)
    const starredCard = page.locator('article:has(button[aria-pressed="true"])');
    await expect(starredCard).toHaveCount(1);
    const starredQuestion = await questionText(starredCard).innerText();

    // 刷新:收藏状态还在
    await page.reload();
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);
    await expect(page.getByRole("button", { name: "取消收藏" })).toHaveCount(1);

    // 「仅看收藏」:只剩被收藏的那道题
    await page.getByRole("checkbox", { name: "仅看收藏" }).check();
    await expect(page).toHaveURL(/starred=true/);
    await expect(cards(page)).toHaveCount(1);
    await expect(questionText(cards(page).first())).toHaveText(starredQuestion);
  });

  /* ────────────────────────────────────────────────────────────
   * 6. 筛选可用:条件写进 URL,刷新不丢
   * ──────────────────────────────────────────────────────────── */
  test("题库筛选可用:条件写进 URL,刷新后仍在", async ({ page }) => {
    await page.goto("/questions");
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 分类:深挖 → 6 道
    await page.getByLabel("分类").selectOption("deep");
    await expect(page).toHaveURL(/category=deep/);
    await expect(cards(page)).toHaveCount(DEEP_COUNT);

    // 刷新后条件还在
    await page.reload();
    await expect(page).toHaveURL(/category=deep/);
    await expect(cards(page)).toHaveCount(DEEP_COUNT);

    // 分类:基础 → 6 道
    await page.getByLabel("分类").selectOption("basic");
    await expect(page).toHaveURL(/category=basic/);
    await expect(cards(page)).toHaveCount(DEEP_COUNT);

    // 回到全部分类
    await page.getByLabel("分类").selectOption("");
    await expect(page).not.toHaveURL(/category=/);
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 难度:原理机制(第 3 档)→ 3 道
    await page.getByLabel("难度").selectOption("3");
    await expect(page).toHaveURL(/difficulty=3/);
    await expect(cards(page)).toHaveCount(DIFFICULTY_3_COUNT);

    await page.reload();
    await expect(page).toHaveURL(/difficulty=3/);
    await expect(cards(page)).toHaveCount(DIFFICULTY_3_COUNT);

    await page.getByLabel("难度").selectOption("");
    await expect(page).not.toHaveURL(/difficulty=/);
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 关键词:命中题干 / 答案 / 考点里的技能名
    await page.getByRole("searchbox").fill("TypeScript");
    await page.getByRole("button", { name: "筛选" }).click();
    await expect(page).toHaveURL(/q=TypeScript/);
    await expect(cards(page)).toHaveCount(KEYWORD_HIT_COUNT);
    for (const text of await questionText(cards(page)).allInnerTexts()) {
      expect(text).toContain("TypeScript");
    }
  });

  /* ────────────────────────────────────────────────────────────
   * 7. 同一份简历再押一次 → 整套高度重复 → 强行入库也不新增题
   * ──────────────────────────────────────────────────────────── */
  test("同一份简历再押一次:整套高度重复,强行入库也不新增题", async ({ page }) => {
    await page.goto("/interview");

    // 第一套已入库,页面回到选简历阶段
    await expect(page.getByRole("button", { name: "开始押题" })).toBeVisible();
    const resumeBtn = page.getByRole("button", { name: RESUME_TITLE });
    await expect(resumeBtn).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "开始押题" }).click();

    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 红色提示条:这套跟题库里已有的题高度重复
    const banner = page.getByRole("alert").filter({ hasText: "这套与题库里已有的题高度重复" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/重复了 12 \/ 12 题/);

    // 整套被判重 → 底部没有「确认入库题库」按钮
    await expect(page.getByRole("button", { name: "确认入库题库" })).toHaveCount(0);

    // 「仍要入库」逃生口在提示条上
    const forceBtn = page.getByRole("button", { name: /仍要入库/ });
    await expect(forceBtn).toHaveText(/仍要入库.*0 题/);

    // 点了它:服务端发现一题都不剩,返回 409 all_duplicate
    await forceBtn.click();
    await expect(page.getByText(/这套题全部与题库重复/)).toBeVisible();

    // 题库题数不变 —— 仍然是 12 道,不是 24 道
    await page.goto("/questions");
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);
  });
});
