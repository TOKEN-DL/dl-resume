/**
 * 后台执行器 —— 推进优化节点。
 *
 * 关键点:**这个函数跑在服务端,跟浏览器彻底解耦**。
 * 页面只是轮询任务状态;用户切到别的页面、关掉标签页,任务照跑。
 * 回来的时候 GET /api/optimize/[id] 就能拿到完整进度与结果。
 *
 * 每个节点都有最短展示时长(MIN_STAGE_MS),让进度条是可读的过程而不是一次跳变。
 */
import type { ResumeData } from "@/lib/validation/resume";
import { analyzeResume, summarize } from "./analyzer";
import { buildPlan, markAutoFixed } from "./planner";
import { pickProvider, reviewWithAgent, rewriteWithAgent } from "./agent";
import { getJob, getJobData, updateJob } from "./job-store";
import { MIN_STAGE_MS, STAGES } from "./stages";
import type { OptimizeJob, OptimizeReport, StageState } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stageOf(job: OptimizeJob, key: string): StageState {
  let s = job.stages.find((x) => x.key === key);
  if (!s) {
    s = { key: key as StageState["key"], status: "pending" };
    job.stages.push(s);
  }
  return s;
}

/** 进入节点 */
function beginStage(job: OptimizeJob, key: string): void {
  const s = stageOf(job, key);
  s.status = "running";
  s.startedAt = Date.now();
  s.finishedAt = undefined;
  s.error = undefined;
  updateJob(job.id, {});
}

/**
 * 结束节点。
 *
 * 注意顺序:**先把这一格的时间补足,再标记完成**。
 * 补足期间节点仍然是「进行中」—— 否则进度条上会出现一段
 * 「没有任何节点在进行」的空白,用户会以为卡住了。
 */
async function endStage(
  job: OptimizeJob,
  key: string,
  detail: string,
): Promise<void> {
  const s = stageOf(job, key);
  if (s.startedAt) {
    const elapsed = Date.now() - s.startedAt;
    if (elapsed < MIN_STAGE_MS) await sleep(MIN_STAGE_MS - elapsed);
  }
  s.status = "done";
  s.detail = detail;
  s.finishedAt = Date.now();
  updateJob(job.id, {});
}

function failStage(job: OptimizeJob, key: string, error: string): void {
  const s = stageOf(job, key);
  s.status = "failed";
  s.error = error;
  s.finishedAt = Date.now();
  updateJob(job.id, {});
}

/**
 * 跑一个优化任务。
 *
 * 由 API 在创建任务后以「不 await」的方式调用 —— HTTP 响应立刻返回,
 * 任务在后台继续。
 */
export async function runJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const source = getJobData<ResumeData>(jobId);
  if (!source) {
    updateJob(jobId, { status: "failed", error: "找不到源简历数据" });
    return;
  }

  updateJob(jobId, { status: "running" });

  try {
    /* ── 1. 解析体检 ─────────────────────────────────────── */
    await beginStage(job, "audit");
    const localReviews = analyzeResume(source);
    const issueCount = localReviews.reduce((n, r) => n + r.findings.length, 0);
    await endStage(job, "audit", `发现 ${issueCount} 个待优化点`);

    /* ── 2. 逐模块评价 ───────────────────────────────────── */
    await beginStage(job, "review");
    const choice = pickProvider();
    const { reviews, choice: c1 } = await reviewWithAgent(source, choice);
    await endStage(job, "review", `${reviews.length} 个模块已评价 · ${c1.provider.label}`);

    /* ── 3. 生成优化方案 ─────────────────────────────────── */
    await beginStage(job, "plan");
    const plan = buildPlan(reviews, []);
    await endStage(job, "plan", `生成 ${plan.length} 条优化建议`);

    /* ── 4. 按方案改写 ───────────────────────────────────── */
    await beginStage(job, "rewrite");
    const { optimized, changes, choice: c2 } = await rewriteWithAgent(
      source,
      plan,
      reviews,
      c1,
    );
    await endStage(job, "rewrite", `${changes.length} 处改动 · ${c2.provider.label}`);

    /* ── 5. 导出对照 ─────────────────────────────────────── */
    await beginStage(job, "export");
    const finalReviews = markAutoFixed(reviews, changes);
    const finalPlan = buildPlan(finalReviews, changes);
    const report: OptimizeReport = {
      provider: c2.provider.id,
      providerLabel: c2.provider.label,
      engineNote: c2.engineNote,
      reviews: finalReviews,
      plan: finalPlan,
      changes,
      original: source,
      optimized,
      summary: summarize(finalReviews),
      createdAt: Date.now(),
    };
    updateJob(jobId, { report });
    await endStage(job, "export", "改写后的简历与前后对照已生成");

    /* ── 6. 等待确认 ─────────────────────────────────────── */
    await beginStage(job, "confirm");
    // 先把节点走完再切状态 —— 否则前端会在 confirm 还是「进行中」的时候
    // 就判定任务结束,进度条停在 91% 而不是 100%
    await endStage(job, "confirm", "等你确认后写入简历历史");
    updateJob(jobId, { status: "awaiting-confirm" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const running = job.stages.find((s) => s.status === "running");
    if (running) failStage(job, running.key, message);
    updateJob(jobId, { status: "failed", error: message });
  }
}

/** 节点总数 —— 给前端画进度条用 */
export const STAGE_COUNT = STAGES.length;
