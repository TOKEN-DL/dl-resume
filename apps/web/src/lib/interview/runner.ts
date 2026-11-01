/**
 * 后台执行器 —— 推进押题节点。
 *
 * 关键点:**这个函数跑在服务端,跟浏览器彻底解耦**。
 * 页面只是轮询任务状态;用户切到别的页面、关掉标签页,任务照跑。
 * 回来的时候 GET /api/interview/[id] 就能拿到完整进度与结果。
 *
 * 五个节点:
 *   scan    简历扫描 —— 抽技能关键词与项目
 *   generate 出题     —— 第一次模型调用(或本地兜底);带上「已出过的题」让模型避开
 *   dedupe  查重     —— 套内 + 跨套判重,本地计算,不调模型
 *   answer  出答案   —— 第二次模型调用,只针对保留下来的题
 *   confirm 待确认入库 —— 等用户确认(#21 才真正写库)
 *
 * 每个节点都有最短展示时长(MIN_STAGE_MS),让进度条是可读的过程而不是一次跳变。
 */
import type { ResumeData } from "@/lib/validation/resume";
import {
  dedupeWithinSet,
  generateAnswers,
  generateQuestions,
  scanResume,
} from "./generator";
import { getJob, getJobData, updateJob } from "./job-store";
import { listQuestionItems } from "./repo";
import { dedupeAgainstLibrary, loadLibrary, toJobDedupe } from "./cross-dedupe";
import { MIN_STAGE_MS, STAGES } from "./stages";
import type { InterviewJob, InterviewQuestion, StageState } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stageOf(job: InterviewJob, key: string): StageState {
  let s = job.stages.find((x) => x.key === key);
  if (!s) {
    s = { key: key as StageState["key"], status: "pending" };
    job.stages.push(s);
  }
  return s;
}

/** 进入节点 */
function beginStage(job: InterviewJob, key: string): void {
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
  job: InterviewJob,
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

function failStage(job: InterviewJob, key: string, error: string): void {
  const s = stageOf(job, key);
  s.status = "failed";
  s.error = error;
  s.finishedAt = Date.now();
  updateJob(job.id, {});
}

/** 已出过的题干最多取多少条 —— 太多会撑爆提示词,最近出的最可能再来一遍 */
const ASKED_LIMIT = 60;

/**
 * 这份简历已经出过的题干(最近 60 条,按创建时间倒序)。
 *
 * 生成前规避的第一道防线:把清单喂给模型,让它绕开这些题。
 * 只取这份简历的 —— 别的简历出的题不算「这份简历问过的」。
 */
async function listAskedQuestions(userId: string, resumeId: string): Promise<string[]> {
  const rows = await listQuestionItems(userId, { resumeId, limit: ASKED_LIMIT });
  return rows.map((r) => r.question).filter((q) => typeof q === "string" && q.trim());
}

/**
 * 跑一个押题任务。
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

  // 引擎说明收集到一处,最后统一写进任务 —— 出题与出答案两段可能各自
  // 退回本地兜底,两条说明都要留着,不能后一条把前一条盖掉。
  const notes: string[] = [];

  try {
    /* ── 1. 简历扫描 ─────────────────────────────────────────── */
    await beginStage(job, "scan");
    const scan = scanResume(source);
    await endStage(job, "scan", `识别到 ${scan.skillCount} 个技能 · ${scan.projectCount} 段项目`);

    /* ── 2. 出题 ─────────────────────────────────────────────── */
    await beginStage(job, "generate");
    // 第一道防线(生成前规避):把这份简历已经出过的题干喂给模型,让它绕开
    const alreadyAsked = await listAskedQuestions(job.userId, job.source.resumeId);
    const generated = await generateQuestions(source, alreadyAsked);
    if (generated.engineNote) notes.push(generated.engineNote);
    await endStage(job, "generate", `生成 ${generated.questions.length} 道题`);

    /* ── 3. 查重(套内 + 跨套) ─────────────────────────────────── */
    await beginStage(job, "dedupe");
    const { kept, skipped } = dedupeWithinSet(generated.questions);
    // 第二道防线(生成后判定):跟题库里已有的题逐题比一遍。
    // 比的是**整个题库**而不是这份简历的 —— 换一份简历也可能问出同一道题。
    const library = await loadLibrary(job.userId);
    const cross = dedupeAgainstLibrary(kept, library);
    updateJob(jobId, { dedupe: toJobDedupe(cross) });
    await endStage(job, "dedupe", `跳过 ${skipped + cross.duplicateCount} 道重复题`);

    if (kept.length === 0) {
      throw new Error("这套题全部重复,换一份简历或稍后再试");
    }

    /* ── 4. 出答案 ───────────────────────────────────────────── */
    await beginStage(job, "answer");
    const answered = await generateAnswers(source, kept);
    if (answered.engineNote) notes.push(answered.engineNote);
    const questions: InterviewQuestion[] = kept.map((q, i) => ({
      ...q,
      answer: answered.answers[i] ?? "",
    }));
    const answeredCount = questions.filter((q) => q.answer.trim()).length;
    updateJob(jobId, { questions });
    await endStage(job, "answer", `生成 ${answeredCount} 份参考答案`);

    /* ── 5. 待确认入库 ───────────────────────────────────────── */
    await beginStage(job, "confirm");
    const engineNote = [...new Set(notes)].join(";");
    if (engineNote) updateJob(jobId, { engineNote });
    // 先把节点走完再切状态 —— 否则前端会在 confirm 还是「进行中」的时候
    // 就判定任务结束,进度条停在 91% 而不是 100%
    await endStage(job, "confirm", "等你确认后写入题库");
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
