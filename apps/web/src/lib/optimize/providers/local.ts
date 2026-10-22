/**
 * 本地 provider —— 纯规则引擎,不需要任何外部服务或 key。
 *
 * 它是整个模块的**兜底**:没配 MiniMax key 时,优化流程依然完整可用
 * (评价、方案、进度、确认入库全都工作),只是改写只做保守的结构性调整。
 */
import { analyzeResume, summarize } from "../analyzer";
import { rewriteLocally } from "../rewriter";
import type { OptimizeProvider, RewriteInput, RewriteOutput, ReviewInput } from "./provider";
import type { Change, ModuleReview } from "../types";

export const localProvider: OptimizeProvider = {
  id: "local",
  label: "本地规则引擎",

  async review(input: ReviewInput): Promise<ModuleReview[]> {
    return analyzeResume(input.data);
  },

  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    const { optimized, changes } = rewriteLocally(input.data);
    // 方案里点名要改的模块,至少把对应改动标出来,方便 UI 对照
    const touched = new Set(input.plan.map((p) => p.target ?? "").filter(Boolean));
    const relevant: Change[] = changes.filter((c) => {
      for (const t of touched) {
        if (t === c.target || t.startsWith(`${c.target}.`) || t.startsWith(`${c.target}:`)) {
          return true;
        }
      }
      return true;
    });
    return { optimized, changes: relevant };
  },
};

export { summarize };
