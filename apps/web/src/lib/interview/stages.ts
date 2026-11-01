/**
 * 押题节点定义 —— 进度条上的每一格。
 *
 * 与优化模块(optimize/stages.ts)是同构体:同样五个节点有各自的
 * 「现在在干什么」与「干完了得到什么」,失败时能单独看到是哪一步挂了。
 *
 * 与优化模块的差别只有一处:**节点数从 6 降到 5** ——
 * 押题没有「导出对照」,查重是本地计算不调模型,五个节点刚好覆盖
 * 简历扫描 → 出题 → 查重 → 出答案 → 待确认入库。
 */
import type { InterviewStageKey, StageStatus } from "./types";

export interface StageDef {
  key: InterviewStageKey;
  title: string;
  /** 进行中时显示的一句话 */
  hint: string;
}

export const STAGES: StageDef[] = [
  {
    key: "scan",
    title: "简历扫描",
    hint: "抽取技能关键词、项目与经历",
  },
  {
    key: "generate",
    title: "出题",
    hint: "生成 12 道题的题干、考点、难度与分类",
  },
  {
    key: "dedupe",
    title: "查重",
    hint: "比对同一套题,去掉重复的",
  },
  {
    key: "answer",
    title: "出答案",
    hint: "只为保留下来的题生成参考答案",
  },
  {
    key: "confirm",
    title: "待确认入库",
    hint: "你确认后才会写入题库",
  },
];

export const STAGE_MAP: Record<InterviewStageKey, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<InterviewStageKey, StageDef>;

/** 节点状态对应的展示文案 */
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "等待中",
  running: "进行中",
  done: "已完成",
  failed: "失败",
  skipped: "已跳过",
};

/**
 * 每个节点的最短展示时长(ms)。
 *
 * 本地兜底出题是毫秒级的,进度条会「唰」一下就到底,用户根本看不到
 * 节点在推进。这里给每个节点一个感知下限,让进度是**可读的过程**
 * 而不是一次跳变。真实调用大模型时节点耗时远超这个下限,不影响真实节奏。
 */
export const MIN_STAGE_MS = 420;
