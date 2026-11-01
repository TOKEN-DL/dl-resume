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

/**
 * 判重命中的规则。
 *
 * 这里**不 import** dedupe.ts 里的 DedupRule —— types.ts 会被客户端组件 import,
 * 而 dedupe.ts 顺着 fingerprint.ts 摸到 node:crypto,会把服务端依赖带进浏览器包。
 * 两边的取值必须一致(R1 / R2 / R3),改一处记得改另一处。
 */
export type JobDedupRule = "R1" | "R2" | "R3";

/** 单题判重的命中记录 —— 一道题跟题库里哪道重复 */
export interface JobDedupeHit {
  /** 在 job.questions 里的下标 */
  index: number;
  /** 命中的规则 */
  rule: JobDedupRule;
  /** 相似度:R1 恒为 1,R3 通常很低 */
  similarity: number;
  /** 与之重复的那道既有题的题干 */
  matchedQuestion: string;
  /** 与之重复的那道题属于哪一套 */
  matchedSetId: string;
  /** 那一套的来源简历标题 */
  matchedSetTitle: string;
}

/**
 * 跨套判重结果(#22)—— 存在任务里,前端拿它出提示条。
 *
 * 「整套不入库」的依据是 isDuplicate:本套与**任一**既有套的重复率 ≥ 55%。
 */
export interface JobDedupeResult {
  /** 本套题总数 */
  totalCount: number;
  /** 与既有题重复的题数 */
  duplicateCount: number;
  /** 重复率 = 重复题数 / 本套题总数 */
  ratio: number;
  /** 触发门槛所需的重复题数 = ceil(总题数 × 55%) */
  threshold: number;
  /** 是否「整套高度重复」 */
  isDuplicate: boolean;
  /**
   * 最像的那一套(重复最多的那一套)。
   *
   * duplicateCount 是**与这一套**重复的题数 —— 套级门槛就是按它算的,
   * 提示条上报的也必须是它。全库重复数(duplicateCount)算的是「跟题库里任何一道重复」,
   * 两个数不是一个口径,混用会让提示条上的比例对不上触发拦截的那一套。
   */
  matchedSet: {
    id: string;
    title: string;
    createdAt: number;
    /** 与这一套重复的题数 */
    duplicateCount: number;
  } | null;
  /** 逐题命中记录 */
  hits: JobDedupeHit[];
}

/** 生成引擎 —— 模型路径还是本地兜底 */
export type QuestionProvider = "minimax" | "local";

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
  /** 跨套判重结果(#22)—— 生成时算的,前端拿它出「整套高度重复」提示条 */
  dedupe?: JobDedupeResult;
  /**
   * 这套题是谁生成的 —— 入库时原样写进题库的 provider 字段。
   *
   * 单独存一项,而不是从 engineNote 的文案里反推:文案是给人看的,
   * 改一个字就可能让入库的来源标错。
   */
  provider?: QuestionProvider;
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
  /** 跨套判重结果(#22) */
  dedupe?: JobDedupeResult;
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
    dedupe: job.dedupe,
    engineNote: job.engineNote,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
