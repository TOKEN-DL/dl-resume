/**
 * 优化节点定义 —— 进度条上的每一格。
 *
 * 节点划分的原则:每一步都要能对用户说清楚「现在在干什么、干完了得到什么」,
 * 并且**失败时能单独看到是哪一步挂了**,而不是一个笼统的「优化失败」。
 */
import type { OptimizeStageKey, StageStatus } from "./types";

export interface StageDef {
  key: OptimizeStageKey;
  title: string;
  /** 进行中时显示的一句话 */
  hint: string;
}

export const STAGES: StageDef[] = [
  {
    key: "audit",
    title: "解析体检",
    hint: "读取简历结构,标记缺失与异常字段",
  },
  {
    key: "review",
    title: "逐模块评价",
    hint: "按模块打分,逐条给出点评",
  },
  {
    key: "plan",
    title: "生成优化方案",
    hint: "把评价汇总成一份可执行的改动清单",
  },
  {
    key: "rewrite",
    title: "按方案改写",
    hint: "逐条改写正文,只动能被事实支撑的部分",
  },
  {
    key: "export",
    title: "导出对照",
    hint: "生成改写后的完整简历与前后差异",
  },
  {
    key: "confirm",
    title: "等待确认",
    hint: "你确认后才会写入简历历史",
  },
];

export const STAGE_MAP: Record<OptimizeStageKey, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<OptimizeStageKey, StageDef>;

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
 * 本地规则引擎跑得很快(毫秒级),进度条会「唰」一下就到底,用户根本
 * 看不到节点在推进。这里给每个节点一个感知下限,让进度是**可读的过程**
 * 而不是一次跳变。真实调用大模型时节点耗时远超这个下限,不影响真实节奏。
 */
export const MIN_STAGE_MS = 420;
