/**
 * 方案生成 —— 把「评价」翻译成「要做什么」。
 *
 * 一条方案 = 一条发现 + 具体动作 + (如果已经改好了)前后对照。
 * 用户看到的是:哪里有问题、为什么有问题、要怎么改、改完长什么样。
 */
import type { Change, Finding, ModuleKey, ModuleReview, PlanItem } from "./types";
import { MODULE_ORDER } from "./analyzer";

/** 裸模块名(work / projects / skills …) */
const MODULE_KEYS = new Set<string>(MODULE_ORDER);

/**
 * 给一条发现找对应的改动。
 *
 * target 的路径有两级:细粒度(`work:w_1.description`)与粗粒度(`work`)。
 * 匹配时**取最具体的那条** —— 命中 `work:w_1.description` 就不要拿
 * 整个 `work` 段的对照来糊弄。
 *
 * 两条规则:
 *   1. 精确命中。
 *   2. 允许「发现比改动粗」:发现 `basics.label` 可以对上改动 `basics.label.x`。
 *
 * 但**裸模块名不认领单条改动**:发现 `projects` 说的是「这个模块整体有问题」,
 * 而改动 `projects:p_1.description` 只是其中一条 —— 挂上去就成了误导。
 * 「两个核心公司项目没进 projects 模块」配上「个人项目描述已改写」,
 * 用户会以为那个结构问题已经解决了。
 */
export function matchChange(target: string | undefined, changes: Change[]): Change | undefined {
  if (!target) return undefined;
  const candidates = changes.filter((c) => {
    if (c.target === target) return true;
    if (MODULE_KEYS.has(target)) return false;
    return c.target.startsWith(`${target}.`) || c.target.startsWith(`${target}:`);
  });
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => b.target.length - a.target.length)[0];
}

/** 从 target 猜它属于哪个模块 —— 给「没有对应问题的改动」归类用 */
function moduleOfTarget(target: string): ModuleKey {
  const head = target.split(/[.:]/)[0];
  const known: ModuleKey[] = [
    "basics",
    "summary",
    "work",
    "projects",
    "skills",
    "education",
    "languages",
    "awards",
    "certificates",
    "interests",
  ];
  return known.includes(head as ModuleKey) ? (head as ModuleKey) : "basics";
}

/** 严重度排序:先说要紧的 */
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

/**
 * 由评价生成方案。
 *
 * 已经被自动改掉的发现会带上 change,并标记 autoFixed ——
 * 用户在报告里一眼能看出「这条我不用管,已经改好了」。
 */
export function buildPlan(reviews: ModuleReview[], changes: Change[]): PlanItem[] {
  const items: PlanItem[] = [];
  const matched = new Set<string>();

  for (const review of reviews) {
    for (const f of review.findings) {
      const change = matchChange(f.target, changes);
      if (change) matched.add(change.target);
      items.push({
        id: f.id,
        module: f.module,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        action: change ? `已自动改写:${change.label}` : f.suggestion,
        target: f.target,
        change,
      });
    }
  }

  /**
   * 没有对应问题的改动(比如「工作经历按时间倒序」这种整体调整)
   * 单独成条。
   *
   * 硬塞给某条问题会变成误导 —— 报告里写着「这条描述要补数字」,
   * 底下却挂着排序的对照;直接丢掉又会让用户不知道简历被改了什么。
   */
  for (const c of changes) {
    if (matched.has(c.target)) continue;
    items.push({
      id: `change:${c.target}`,
      module: moduleOfTarget(c.target),
      severity: "info",
      title: `已自动调整:${c.label}`,
      detail: "这项不需要你补充信息,确认后会一起写入简历。",
      action: `已自动改写:${c.label}`,
      target: c.target,
      change: c,
    });
  }

  items.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.module.localeCompare(b.module);
  });

  return items;
}

/** 把「已自动改写」标记回发现上 */
export function markAutoFixed(reviews: ModuleReview[], changes: Change[]): ModuleReview[] {
  return reviews.map((r) => ({
    ...r,
    findings: r.findings.map((f): Finding => {
      const change = matchChange(f.target, changes);
      return change ? { ...f, autoFixed: true } : f;
    }),
  }));
}
