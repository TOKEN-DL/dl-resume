/**
 * 后台优化任务表。
 *
 * 为什么挂在 globalThis 上:
 * Next.js 会给每个 route handler 单独打一个 bundle,模块级变量在
 * 「POST /api/optimize 建的」和「GET /api/optimize/[id] 读的」之间
 * **不是同一个实例**。挂到 globalThis 上,同一个 Node 进程里才共享得到。
 * 这是 Next.js 官方文档给单例推荐的做法。
 *
 * 任务只存在内存里:进程重启就没了。这是有意的取舍 —— 优化流程的任务
 * 本身就是临时的,落库还得额外处理过期清理,不划算。
 * 需要长期留存的东西(比如题库)走 Prisma 表,那边有正常的迁移机制。
 */
import type { OptimizeJob, JobStatus } from "./types";
import { STAGES } from "./stages";

interface JobGlobals {
  __optimizeJobs?: Map<string, OptimizeJob>;
  /** 源简历正文 —— 不塞进 job 对象,避免任务列表接口把正文带出去 */
  __optimizeJobData?: Map<string, { data: unknown; title: string; template: string }>;
}

const g = globalThis as unknown as JobGlobals;

const jobs: Map<string, OptimizeJob> = (g.__optimizeJobs ??= new Map());
const jobData: Map<string, { data: unknown; title: string; template: string }> =
  (g.__optimizeJobData ??= new Map());

/** 任务保留时长:2 小时后自动清理 */
const TTL_MS = 2 * 60 * 60 * 1000;

export function createJob(
  job: OptimizeJob,
  source: { data: unknown; title: string; template: string },
): OptimizeJob {
  jobs.set(job.id, job);
  jobData.set(job.id, source);
  pruneJobs();
  return job;
}

export function getJob(id: string): OptimizeJob | undefined {
  return jobs.get(id);
}

export function getJobData<T>(id: string): T | undefined {
  return jobData.get(id)?.data as T | undefined;
}

export function listJobs(userId: string): OptimizeJob[] {
  return [...jobs.values()]
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 列出某个用户所有「还在跑或等确认」的任务 */
export function listActiveJobs(userId: string): OptimizeJob[] {
  return listJobs(userId).filter(
    (j) => j.status === "queued" || j.status === "running" || j.status === "awaiting-confirm",
  );
}

export function updateJob(id: string, patch: Partial<OptimizeJob>): OptimizeJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: Date.now() });
  recomputeProgress(job);
  return job;
}

export function setJobStatus(id: string, status: JobStatus): OptimizeJob | undefined {
  return updateJob(id, { status });
}

export function deleteJob(id: string): void {
  jobs.delete(id);
  jobData.delete(id);
}

/** 按节点状态算进度(0-1) */
export function recomputeProgress(job: OptimizeJob): number {
  const total = STAGES.length;
  const done = job.stages.filter((s) => s.status === "done").length;
  const running = job.stages.some((s) => s.status === "running") ? 0.5 : 0;
  job.progress = Math.max(0, Math.min(1, (done + running) / total));
  return job.progress;
}

/** 清理过期任务,防止内存无限增长 */
export function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL_MS) {
      jobs.delete(id);
      jobData.delete(id);
    }
  }
}

/** 仅测试用:清空任务表 */
export function clearJobs(): void {
  jobs.clear();
  jobData.clear();
}
