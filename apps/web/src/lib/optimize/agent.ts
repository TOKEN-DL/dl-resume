/**
 * 智能体编排 —— 决定「谁来做评价和改写」,并把结果合成一份报告。
 *
 * 关键设计:**本地规则引擎永远先跑一遍**,它的评价是确定性的、可复现的,
 * 也是所有改动的依据。大模型(如果配了 key)在此之上**追加**它独有的发现,
 * 并负责内容级改写。
 *
 * 任何一步大模型出错,都自动退回本地结果 —— 优化流程不能因为外部服务
 * 抖动就整条断掉。
 */
import type { ResumeData } from "@/lib/validation/resume";
import { analyzeResume, scoreOf, summarize } from "./analyzer";
import { buildPlan, markAutoFixed } from "./planner";
import { rewriteLocally } from "./rewriter";
import type {
  Change,
  Finding,
  ModuleKey,
  ModuleReview,
  OptimizeReport,
  PlanItem,
} from "./types";
import { localProvider } from "./providers/local";
import { hasMiniMaxKey, minimaxProvider } from "./providers/minimax";
import type { OptimizeProvider } from "./providers/provider";

export interface ProviderChoice {
  provider: OptimizeProvider;
  /** 实际生效的引擎说明(比如「MiniMax 失败,已回退本地规则引擎」) */
  engineNote?: string;
}

/** 选 provider:有 key 用大模型,没有就用本地 */
export function pickProvider(): ProviderChoice {
  if (hasMiniMaxKey()) {
    return { provider: minimaxProvider };
  }
  return {
    provider: localProvider,
    engineNote: "未配置 MINIMAX_API_KEY,当前使用本地规则引擎(结构体检 + 保守改写)。",
  };
}

/** 标题归一化,用来判断两条发现是不是同一个问题 */
function normalizeTitle(t: string): string {
  return t.replace(/[\s·:：,，.。!！?？、""''「」《》()（）\-—_/]/g, "");
}

function similarTitle(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/** 合并两组发现:本地的优先,大模型独有的追加 */
function mergeFindings(base: Finding[], extra: Finding[]): Finding[] {
  const out = [...base];
  for (const f of extra) {
    const dup = out.find(
      (x) =>
        x.module === f.module &&
        similarTitle(x.title, f.title) &&
        (!x.target || !f.target || x.target === f.target),
    );
    if (dup) continue;
    out.push(f);
  }
  return out;
}

/** 合并两组模块评价 */
export function mergeReviews(
  local: ModuleReview[],
  remote: ModuleReview[],
): ModuleReview[] {
  const byModule = new Map<ModuleKey, ModuleReview>();
  for (const r of local) byModule.set(r.module, r);
  for (const r of remote) {
    const base = byModule.get(r.module);
    if (!base) {
      byModule.set(r.module, r);
      continue;
    }
    const findings = mergeFindings(base.findings, r.findings);
    const score = scoreOf(findings);
    byModule.set(r.module, {
      ...base,
      findings,
      score,
      grade: score >= 80 ? "good" : score >= 60 ? "fair" : "poor",
    });
  }
  return [...byModule.values()];
}

/**
 * 第一步:逐模块评价。
 *
 * 无论有没有大模型,本地评价都会跑;大模型的结果在有 key 时叠加。
 */
export async function reviewWithAgent(
  data: ResumeData,
  choice: ProviderChoice = pickProvider(),
): Promise<{ reviews: ModuleReview[]; choice: ProviderChoice }> {
  const localReviews = analyzeResume(data);

  if (choice.provider.id === "local") {
    return { reviews: localReviews, choice };
  }

  try {
    const remote = await choice.provider.review({
      data,
      target: data.basics.label.trim(),
    });
    return {
      reviews: mergeReviews(localReviews, remote),
      choice: {
        ...choice,
        engineNote: choice.engineNote ?? "评价由本地规则引擎与 MiniMax 合并产出。",
      },
    };
  } catch (e) {
    return {
      reviews: localReviews,
      choice: {
        ...choice,
        provider: localProvider,
        engineNote: `MiniMax 评价失败(${
          e instanceof Error ? e.message : "未知错误"
        }),已回退本地规则引擎。`,
      },
    };
  }
}

/**
 * 第三步:按方案改写。
 *
 * 大模型返回的是完整简历,必须过 repairResumeData 兜底(模型可能漏字段)。
 * 大模型失败时用本地改写结果,流程不中断。
 */
export async function rewriteWithAgent(
  data: ResumeData,
  plan: PlanItem[],
  reviews: ModuleReview[],
  choice: ProviderChoice = pickProvider(),
): Promise<{
  optimized: ResumeData;
  changes: Change[];
  choice: ProviderChoice;
}> {
  const local = rewriteLocally(data);

  if (choice.provider.id === "local") {
    return { ...local, choice };
  }

  try {
    const remote = await choice.provider.rewrite({ data, plan, reviews });
    // 合并两边的改动:本地改动在前(确定性),大模型改动在后
    const seen = new Set(local.changes.map((c) => `${c.target}|${c.after}`));
    const merged = [
      ...local.changes,
      ...remote.changes.filter((c) => !seen.has(`${c.target}|${c.after}`)),
    ];
    return {
      optimized: remote.optimized,
      changes: merged,
      choice: {
        ...choice,
        engineNote:
          choice.engineNote ?? "改写由 MiniMax 完成,本地规则补齐了结构性问题。",
      },
    };
  } catch (e) {
    return {
      ...local,
      choice: {
        ...choice,
        provider: localProvider,
        engineNote: `MiniMax 改写失败(${
          e instanceof Error ? e.message : "未知错误"
        }),已回退本地规则引擎。`,
      },
    };
  }
}

/**
 * 完整跑一遍(不推进度节点)—— 给测试与「不拆节点」的场合用。
 */
export async function optimizeResume(data: ResumeData): Promise<OptimizeReport> {
  const { reviews, choice: c1 } = await reviewWithAgent(data);
  const plan = buildPlan(reviews, []);
  const { optimized, changes, choice } = await rewriteWithAgent(data, plan, reviews, c1);
  const finalReviews = markAutoFixed(reviews, changes);
  const finalPlan = buildPlan(finalReviews, changes);
  return {
    provider: choice.provider.id,
    providerLabel: choice.provider.label,
    engineNote: choice.engineNote,
    reviews: finalReviews,
    plan: finalPlan,
    changes,
    original: data,
    optimized,
    summary: summarize(finalReviews),
    createdAt: Date.now(),
  };
}
