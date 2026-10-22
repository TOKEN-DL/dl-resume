/**
 * Provider 抽象 —— 「智能体」的可插拔后端。
 *
 * 优化流程本身(节点推进、进度、方案生成)与「谁来做评价和改写」是解耦的:
 * 现在默认用 local(纯规则引擎),配上 MINIMAX_API_KEY 后自动切到 minimax。
 * 以后要接别的模型,实现这个接口就行,流程一行都不用改。
 */
import type { Change, ModuleReview, PlanItem } from "../types";
import type { ResumeData } from "@/lib/validation/resume";

export interface ReviewInput {
  /** 待评价的简历 */
  data: ResumeData;
  /** 目标岗位(取自求职意向),给模型一点上下文 */
  target?: string;
}

export interface RewriteInput {
  /** 原始简历 */
  data: ResumeData;
  /** 已生成的方案 */
  plan: PlanItem[];
  /** 已生成的评价 */
  reviews: ModuleReview[];
}

export interface RewriteOutput {
  optimized: ResumeData;
  changes: Change[];
}

export interface OptimizeProvider {
  id: string;
  label: string;
  /** 逐模块评价 */
  review(input: ReviewInput): Promise<ModuleReview[]>;
  /** 按方案改写 */
  rewrite(input: RewriteInput): Promise<RewriteOutput>;
}

/** 目标岗位:优先用求职意向 */
export function targetOf(data: ResumeData): string {
  return data.basics.label.trim();
}

/**
 * 发给模型的简历要**去掉头像**。
 *
 * 头像是 base64 dataURL(可以到几百 KB),塞进 prompt 既烧 token 又占内存,
 * 而且对「评价内容」毫无帮助。
 */
export function stripHeavyFields(data: ResumeData): ResumeData {
  const copy = structuredClone(data);
  copy.basics.avatar = "";
  return copy;
}
