/**
 * #25 面试押题 —— 端到端全链路验证。
 *
 * 一条完整的旅程,八步:
 *   1. 未登录访问押题页 / 题库页 → 被引导去登录
 *   2. 选简历 → 发起押题 → 进度推进 → 看到 12 道题
 *   3. 展开参考答案;刷新后折叠态的答案**不在 DOM 里**
 *   4. 标记「重点关注」→ 入库 → 题库可见且已是收藏
 *   5. 收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题
 *   6. 题库筛选可用:条件写进 URL,刷新不丢
 *   7a. 同一份简历再押一次 → 出的是**全新**的题,入库不产生任何重复
 *   7b. 窄关键词池的简历再押一次 → 整套高度重复,被拦下,一题都入不了库
 *
 * 7a 与 7b 是两件不同的事,不能混:
 *   - 7a 验的是「重复的是同一道题入库两次」—— 押第二套要能押出**新题**,
 *     并且这 12 道新题入库后题库里一道重复都没有(24 道两两不同)。
 *   - 7b 验的是「关键词池用完了就别假装还能出新的」—— 池子只有 1 个技能时,
 *     组合空间 12,第二轮必然跟第一轮一模一样,整套被判重拦下,
 *     用户点「仍要入库」也一题都进不去,题库题数不变。
 *
 * 用例之间有前后依赖(第一轮的结果是第二轮的前提),所以整组串行跑。
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/** 种子简历 A 的标题 —— 6 个技能,组合空间大 */
const RESUME_TITLE = "E2E 测试简历";
/** 种子简历 B 的标题 —— 1 个技能,组合空间小 */
const RESUME_TITLE_NARROW = "E2E 测试简历-窄";
/** 一次押题的题数 */
const QUESTION_COUNT = 12;
/** 种子简历 A 的技能池恰好 6 个 → 基础 / 深挖各 6 道 */
const DEEP_COUNT = 6;
/** 每档难度 3 道 */
const DIFFICULTY_3_COUNT = 3;
/** 技能池 6 个、模板 12 槽位 → 每个技能落在 2 道题里 */
const KEYWORD_HIT_COUNT = 2;
/** 两轮之后题库里的题数:12(第一轮)+ 12(第二轮新题) */
const AFTER_SECOND_ROUND_COUNT = 24;
/** 再加窄池简历的第一轮 12 道 */
const AFTER_NARROW_ROUND_COUNT = 36;

/** 题卡 —— 共用的题卡组件根节点是 <article> */
function cards(page: Page): Locator {
  return page.locator("article");
}

/**
 * 把题库页的两层折叠都打开 —— 题库 › 套 › 题。
 *
 * 题库和套都默认折叠,题卡压根不在 DOM 里。要数题卡,得先把它们展开。
 *
 * 锚点是标题层级:题库名在 h2 里,套的来源简历名在 h3 里。
 * 先展开题库(套的按钮要等题库展开后才在 DOM 里),再展开套。
 */
async function openBank(page: Page): Promise<void> {
  const main = page.locator("main");
  // 题库块头的折叠按钮 —— 页面刚打开时数据还在路上,得等它出现
  await main.locator("h2 button[aria-expanded]").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  for (const selector of ["h2 button[aria-expanded]", "h3 button[aria-expanded]"]) {
    const toggles = main.locator(selector);
    const n = await toggles.count();
    for (let i = 0; i < n; i += 1) {
      const toggle = toggles.nth(i);
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    }
  }
}

/** 题卡的题干 —— 题卡里唯一的 <p> 就是题干(答案是 div,且折叠时不在 DOM 里) */
function questionText(card: Locator): Locator {
  return card.locator(":scope > p");
}

/** 当前这批题卡的题干(按页面顺序) */
async function questionTexts(scope: Locator): Promise<string[]> {
  return await questionText(scope).allInnerTexts();
}

/**
 * 简历选择按钮。
 *
 * 不能用可访问名去 `getByRole("button", { name })` 精确匹配:
 * 按钮的可访问名是「标题 + 相对时间」(「E2E 测试简历 刚刚」),
 * 而且窄池简历的标题正好是宽池简历的前缀 —— 子串匹配会把两个都捞出来。
 * 这里按**标题文本精确**去找那个 span,再反查它所在的按钮。
 */
function resumeButton(page: Page, title: string): Locator {
  return page.locator("button").filter({
    has: page.getByText(title, { exact: true }),
  });
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

    // 选简历:显式点「E2E 测试简历」。
    // 列表默认选中的是第一项,而两份简历的先后顺序(createdAt 倒序,同毫秒时不稳定)
    // 决定不了是谁 —— 必须自己点。
    const resumeBtn = resumeButton(page, RESUME_TITLE);
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();
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

    // 走的是本地兜底模板引擎(空 LLM_API_KEY)—— 确定性、可重复
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

    // 题库 › 套 › 题 两层都默认折叠 —— 题卡不在 DOM 里,得先展开
    await openBank(page);
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 一个题库都没有时,服务端自动建了「默认题库」,那套就在它下面
    await expect(page.getByRole("region", { name: "默认题库" })).toBeVisible();

    // 组头标着生成引擎 —— 出题走的是本地兜底(空 LLM_API_KEY),
    // 入库时写进 provider 字段的就是它
    await expect(page.getByText("本地兜底").first()).toBeVisible();
  });

  /* ────────────────────────────────────────────────────────────
   * 5. 收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题
   * ──────────────────────────────────────────────────────────── */
  test("收藏切换刷新后仍在;「仅看收藏」只剩被收藏的那道题", async ({ page }) => {
    await page.goto("/questions");
    await openBank(page);
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
    await openBank(page);
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
    await openBank(page);
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

    // 回到全部分类 —— 筛选一清,折叠状态就重置了,得重新展开
    await page.getByLabel("分类").selectOption("");
    await expect(page).not.toHaveURL(/category=/);
    await openBank(page);
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
    await openBank(page);
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
   * 7a. 再押一次 → 出的是全新题 → 入库不产生任何重复
   * ──────────────────────────────────────────────────────────── */
  test("再押一次出的是全新题,入库后题库里一道重复都没有", async ({ page }) => {
    // 第一轮那 12 道已经入库了(前面的用例)—— 先把它们的题干抓下来
    await page.goto("/questions");
    await openBank(page);
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);
    const round1 = await questionTexts(cards(page));

    // 对**同一份简历**再押一次
    await page.goto("/interview");
    await expect(page.getByRole("button", { name: "开始押题" })).toBeVisible();
    await resumeButton(page, RESUME_TITLE).click();
    await page.getByRole("button", { name: "开始押题" }).click();
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 第二轮的 12 道题干跟第一轮**没有一道相同** —— 求交集,交集必须为空
    const round2 = await questionTexts(cards(page));
    const duplicated = round2.filter((t) => round1.includes(t));
    expect(duplicated).toEqual([]);

    // 入库:12 道全是新的,一道重复都没有
    await page.getByRole("button", { name: "确认入库题库" }).click();
    const dialog = page.getByRole("dialog", { name: "确认入库题库" });
    await expect(dialog.getByText(/12 题入库 \/ 跳过 0 题重复/)).toBeVisible();
    await dialog.getByRole("button", { name: "确认入库" }).click();
    await expect(page.getByText(/已入库 12 题/)).toBeVisible();

    // 题库变成 24 道,而且 24 道题的题干**两两不同**(去重后还是 24 条)
    await page.goto("/questions");
    await openBank(page);
    await expect(cards(page)).toHaveCount(AFTER_SECOND_ROUND_COUNT);
    const all = await questionTexts(cards(page));
    expect(new Set(all).size).toBe(AFTER_SECOND_ROUND_COUNT);
  });

  /* ────────────────────────────────────────────────────────────
   * 7b. 窄关键词池 → 整套高度重复 → 被拦下,一题都入不了库
   * ──────────────────────────────────────────────────────────── */
  test("窄关键词池的简历再押一次:整套高度重复被拦下,题库题数不变", async ({ page }) => {
    // ── 窄池简历的第一轮:正常入库(题库 24 + 12 = 36 道) ──
    await page.goto("/interview");
    await expect(page.getByRole("button", { name: "开始押题" })).toBeVisible();
    await resumeButton(page, RESUME_TITLE_NARROW).click();
    await page.getByRole("button", { name: "开始押题" }).click();
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    await page.getByRole("button", { name: "确认入库题库" }).click();
    const dialog = page.getByRole("dialog", { name: "确认入库题库" });
    await expect(dialog.getByText(/12 题入库 \/ 跳过 0 题重复/)).toBeVisible();
    await dialog.getByRole("button", { name: "确认入库" }).click();
    await expect(page.getByText(/已入库 12 题/)).toBeVisible();

    await page.goto("/questions");
    await openBank(page);
    await expect(cards(page)).toHaveCount(AFTER_NARROW_ROUND_COUNT);

    // ── 同一份简历再押一次:组合空间只有 12,这轮必然跟上一轮一模一样 ──
    await page.goto("/interview");
    await expect(page.getByRole("button", { name: "开始押题" })).toBeVisible();
    await resumeButton(page, RESUME_TITLE_NARROW).click();
    await page.getByRole("button", { name: "开始押题" }).click();
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 红色提示条:跟**上一套**重复了 12 / 12 题(日期不硬编码,用正则)
    const banner = page.getByRole("alert").filter({ hasText: "这套与题库里已有的题高度重复" });
    await expect(banner).toBeVisible();
    // 提示条正文(实测全文):
    //   「与《E2E 测试简历-窄》2026-11-01 那套重复了 12 / 12 题 —— 默认整套不入库。」
    // 日期是那套的创建日期,**不硬编码** —— 用正则匹配
    await expect(banner).toContainText(
      new RegExp(
        `与《${RESUME_TITLE_NARROW}》\\d{4}-\\d{2}-\\d{2} 那套重复了 12 / 12 题 —— 默认整套不入库。`,
      ),
    );

    // 整套被判重 → 底部没有「确认入库题库」按钮
    await expect(page.getByRole("button", { name: "确认入库题库" })).toHaveCount(0);

    // 「仍要入库」逃生口在提示条上 —— 但一题都不剩
    const forceBtn = page.getByRole("button", { name: /仍要入库/ });
    await expect(forceBtn).toHaveText(/仍要入库.*0 题/);
    await forceBtn.click();

    // 服务端返回 409 all_duplicate
    await expect(page.getByText(/这套题全部与题库重复/)).toBeVisible();

    // 题库题数不变 —— 仍然是 36 道,一道都没多
    await page.goto("/questions");
    await openBank(page);
    await expect(cards(page)).toHaveCount(AFTER_NARROW_ROUND_COUNT);
  });
});

/**
 * 题库自建分组 —— 题库 › 套 › 题 三层结构。
 *
 * 盯四件事:
 *   1. 题库页能新建题库,建好出现第二个题库
 *   2. 押题时能在确认层选「保存到」哪个题库
 *   3. 选中的题库真的接住了这一套
 *   4. 默认题库删不掉(它是用户的兜底容器)
 *
 * 跟在上面那组之后跑 —— 上面那组已经在库里落了 36 道题和 3 套,
 * 这里接着在上面继续:新建的题库从零开始,再押一轮进它里面。
 *
 * 串行模式整个文件已经设过了(见文件头的 test.describe.configure)——
 * 用例之间有前后依赖,不能并行。
 */
test.describe("题库自建分组", () => {
  /** 新建的题库名 */
  const NEW_COLLECTION = "字节跳动 · 后端";

  test("题库页新建题库:建好出现第二个题库,历史套还留在默认题库里", async ({ page }) => {
    await page.goto("/questions");

    // 前面几轮入库时服务端自动建了「默认题库」,3 套都在它下面
    await expect(page.getByRole("region", { name: "默认题库" })).toBeVisible();

    await page.getByRole("button", { name: "＋ 新建题库" }).click();
    await page.getByLabel("题库名").fill(NEW_COLLECTION);
    await page.getByRole("button", { name: "建好" }).click();

    // 新库出现了,默认题库也还在 —— 两个题库并存
    await expect(page.getByRole("region", { name: NEW_COLLECTION })).toBeVisible();
    await expect(page.getByRole("region", { name: "默认题库" })).toBeVisible();

    // 新库是空的(还没往里放过题)
    await openBank(page);
    await expect(page.getByRole("region", { name: NEW_COLLECTION }).locator("article")).toHaveCount(0);
    // 默认题库里的 36 道一道没少
    await expect(page.getByRole("region", { name: "默认题库" }).locator("article")).toHaveCount(
      AFTER_NARROW_ROUND_COUNT,
    );
  });

  test("默认题库删不掉:只给提示,不给删除按钮", async ({ page }) => {
    await page.goto("/questions");

    const def = page.getByRole("region", { name: "默认题库" });
    await expect(def.getByRole("button", { name: "删除" })).toHaveCount(0);
    await expect(def.getByText("默认题库不能删")).toBeVisible();
  });

  test("押题时选「保存到」新建的题库:这一套就落在它下面", async ({ page }) => {
    await page.goto("/interview");

    // 上一个用例留下的任务还等着确认(整套被判重,一题都没入进去)——
    // 押题页会接管它,得先放掉,回到来源选择。
    const again = page.getByRole("button", { name: "再押一套" });
    await again.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    if (await again.count()) await again.click();

    await expect(page.getByRole("button", { name: "开始押题" })).toBeVisible();
    await resumeButton(page, RESUME_TITLE).click();
    await page.getByRole("button", { name: "开始押题" }).click();
    await expect(page.getByRole("heading", { name: "押题完成" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(cards(page)).toHaveCount(QUESTION_COUNT);

    // 二次确认层:下拉里能选到刚才新建的题库
    await page.getByRole("button", { name: "确认入库题库" }).click();
    const dialog = page.getByRole("dialog", { name: "确认入库题库" });
    await expect(dialog.getByText(/12 题入库 \/ 跳过 0 题重复/)).toBeVisible();
    await dialog.getByLabel("保存到").selectOption({ label: NEW_COLLECTION });
    await dialog.getByRole("button", { name: "确认入库" }).click();
    await expect(page.getByText(/已入库 12 题/)).toBeVisible();

    // 题库页:新题库底下多了这一套(12 道),默认题库还是原来那 36 道
    await page.goto("/questions");
    await openBank(page);
    await expect(
      page.getByRole("region", { name: NEW_COLLECTION }).locator("article"),
    ).toHaveCount(QUESTION_COUNT);
    await expect(page.getByRole("region", { name: "默认题库" }).locator("article")).toHaveCount(
      AFTER_NARROW_ROUND_COUNT,
    );
  });
});
