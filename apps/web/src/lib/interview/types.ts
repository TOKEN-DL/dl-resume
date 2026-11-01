/**
 * 面试押题模块的共享类型。
 *
 * 一次押题 = 一串**节点**(stages)+ 一组**题目**(questions)。
 * 节点是给用户看进度的,题目是给用户答题的。
 *
 * 这里只放类型与纯数据,不放逻辑 —— 逻辑在 generator / runner / job-store 里。
 * 与优化模块(optimize/types.ts)是同构体:那边的 OptimizeJob 对应这边的 InterviewJob。
 */

/** 押题节点 —— 进度条上的每一格 */
export type InterviewStageKey =
  | "scan" // 简历扫描
  | "generate" // 出题
  | "dedupe" // 查重
  | "answer" // 出答案
  | "confirm"; // 待确认入库

export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  key: InterviewStageKey;
  status: StageStatus;
  /** 一句话结果摘要,给用户看 */
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

/** 难度档 1-4 */
export type QuestionDifficulty = 1 | 2 | 3 | 4;

/** 题目分类:基础 / 深挖 */
export type QuestionCategory = "basic" | "deep";

/**
 * 模型出题阶段的产物 —— 还没有答案。
 *
 * 答案要等查重之后才生成(去重后保留下来的题才值得烧 token),
 * 所以「题干」和「完整题目」是两个类型。
 */
export interface GeneratedQuestion {
  /** 题干 */
  question: string;
  /** 考点关键词(模型自己标注) */
  topic: string;
  /** basic | deep */
  category: QuestionCategory;
  /** 1-4 */
  difficulty: QuestionDifficulty;
}

/** 一道完整的题 —— 题干 + 参考答案 */
export interface InterviewQuestion extends GeneratedQuestion {
  /** 参考答案;模型没给出来时留空,UI 上标注「参考答案生成失败」 */
  answer: string;
}

/** 任务状态 */
export type InterviewJobStatus =
  | "queued"
  | "running"
  | "awaiting-confirm" // 跑完了,等用户确认(#21 才真正写库)
  | "confirmed" // 已确认入库 —— 题已在题库里,重复确认不再写第二份
  | "failed"
  | "cancelled";

export interface InterviewJob {
  id: string;
  userId: string;
  status: InterviewJobStatus;
  /** 任务标题(简历名) */
  title: string;
  source: {
    kind: "resume";
    /** 来源是历史简历时 */
    resumeId: string;
  };
  stages: StageState[];
  /** 0-1,给进度条 */
  progress: number;
  /** 跑完后才有 */
  questions?: InterviewQuestion[];
  /** 已入库的题库套 id(#21)—— 有值就说明这任务已经确认过,重复确认直接返回上次的结果 */
  resultSetId?: string;
  /** 上次入库实际写进去的题数(#21) */
  resultInserted?: number;
  /** 上次入库因重复被跳过的题数(#21) */
  resultSkipped?: number;
  /** 引擎说明(比如走了本地兜底) */
  engineNote?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** 客户端拿到的任务摘要(不含简历正文) */
export interface InterviewJobSummary {
  id: string;
  userId: string;
  status: InterviewJobStatus;
  title: string;
  source: InterviewJob["source"];
  progress: number;
  currentStage?: InterviewStageKey;
  stages: StageState[];
  questions?: InterviewQuestion[];
  /** 已入库的题库套 id(#21) */
  resultSetId?: string;
  /** 上次入库实际写进去的题数(#21) */
  resultInserted?: number;
  /** 上次入库因重复被跳过的题数(#21) */
  resultSkipped?: number;
  engineNote?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** 把任务压成摘要 —— 列表接口与轮询都用它 */
export function toInterviewJobSummary(job: InterviewJob): InterviewJobSummary {
  const running = job.stages.find((s) => s.status === "running");
  return {
    id: job.id,
    userId: job.userId,
    status: job.status,
    title: job.title,
    source: job.source,
    // 进度保留 4 位小数,免得前端拿到 0.16666666666666666 这种值
    progress: Math.round(job.progress * 10000) / 10000,
    currentStage: running?.key,
    stages: job.stages,
    questions: job.questions,
    resultSetId: job.resultSetId,
    resultInserted: job.resultInserted,
    resultSkipped: job.resultSkipped,
    engineNote: job.engineNote,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
