/**
 * 简历优化模块的共享类型。
 *
 * 一次优化 = 一串**节点**(stages)+ 一份**评价**(reviews)+ 一份**方案**(plan)
 * + 一组**改动**(changes)。节点是给用户看进度的,评价/方案/改动是给用户做决策的。
 *
 * 这里只放类型与纯数据,不放逻辑 —— 逻辑在 analyzer / planner / rewriter / agent 里。
 */
import type { ResumeData } from "@/lib/validation/resume";

/** 优化节点 —— 进度条上的每一格 */
export type OptimizeStageKey =
  | "audit" // 解析体检
  | "review" // 逐模块评价
  | "plan" // 生成优化方案
  | "rewrite" // 按方案改写
  | "export" // 导出对照
  | "confirm"; // 等待确认

export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  key: OptimizeStageKey;
  status: StageStatus;
  /** 一句话结果摘要,给用户看 */
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

/** 简历的模块划分 —— 评价与方案都按模块归类 */
export type ModuleKey =
  | "basics"
  | "summary"
  | "work"
  | "projects"
  | "skills"
  | "education"
  | "languages"
  | "awards"
  | "certificates"
  | "interests";

/** 严重程度 */
export type Severity = "error" | "warn" | "info";

/** 一条评价发现 */
export interface Finding {
  id: string;
  module: ModuleKey;
  severity: Severity;
  /** 一句话结论 */
  title: string;
  /** 展开说明:为什么这是个问题 */
  detail: string;
  /** 怎么改 */
  suggestion: string;
  /** 指向具体字段,如 `work:w_1.description` */
  target?: string;
  /** 本次是否已被自动改写 */
  autoFixed?: boolean;
}

/** 单个模块的评价 */
export interface ModuleReview {
  module: ModuleKey;
  label: string;
  /** 0-100 */
  score: number;
  grade: "good" | "fair" | "poor";
  findings: Finding[];
}

/** 一处改动的前后对照 */
export interface Change {
  /** 字段路径,如 `basics.summary` */
  target: string;
  /** 人类可读的字段名,如「自我评价」 */
  label: string;
  before: string;
  after: string;
}

/** 方案里的一条 */
export interface PlanItem {
  id: string;
  module: ModuleKey;
  severity: Severity;
  title: string;
  detail: string;
  /** 要做的动作 */
  action: string;
  target?: string;
  /** 若已自动改写,带上前后对照 */
  change?: Change;
}

/** 一次优化的完整报告 */
export interface OptimizeReport {
  /** provider id:local / minimax */
  provider: string;
  providerLabel: string;
  /** 实际用的引擎(可能因为 MiniMax 失败而回退) */
  engineNote?: string;
  reviews: ModuleReview[];
  plan: PlanItem[];
  changes: Change[];
  /** 改写前的简历 */
  original: ResumeData;
  /** 改写后的简历 —— 用户确认后就是它入库 */
  optimized: ResumeData;
  summary: {
    score: number;
    errors: number;
    warns: number;
    infos: number;
  };
  createdAt: number;
}

/** 任务状态 */
export type JobStatus =
  | "queued"
  | "running"
  | "awaiting-confirm" // 跑完了,等用户确认
  | "confirmed" // 用户确认,已入库
  | "failed"
  | "cancelled";

export interface OptimizeJob {
  id: string;
  userId: string;
  status: JobStatus;
  /** 任务标题(简历名) */
  title: string;
  template: string;
  source: {
    kind: "resume" | "upload";
    /** 来源是历史简历时 */
    resumeId?: string;
    /** 来源是上传文件时 */
    fileName?: string;
  };
  stages: StageState[];
  /** 0-1,给进度条 */
  progress: number;
  report?: OptimizeReport;
  error?: string;
  /** 确认后创建的简历 id */
  resultResumeId?: string;
  createdAt: number;
  updatedAt: number;
}

/** 客户端拿到的任务摘要(不含简历正文) */
export interface JobSummary {
  id: string;
  status: JobStatus;
  title: string;
  template: string;
  source: OptimizeJob["source"];
  progress: number;
  currentStage?: OptimizeStageKey;
  stages: StageState[];
  error?: string;
  resultResumeId?: string;
  createdAt: number;
  updatedAt: number;
}

/** 把任务压成摘要 —— 列表接口与轮询都用它,避免把简历正文传得到处都是 */
export function toJobSummary(job: OptimizeJob): JobSummary {
  const running = job.stages.find((s) => s.status === "running");
  return {
    id: job.id,
    status: job.status,
    title: job.title,
    template: job.template,
    source: job.source,
    // 进度保留 4 位小数,免得前端拿到 0.16666666666666666 这种值
    progress: Math.round(job.progress * 10000) / 10000,
    currentStage: running?.key,
    stages: job.stages,
    error: job.error,
    resultResumeId: job.resultResumeId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
