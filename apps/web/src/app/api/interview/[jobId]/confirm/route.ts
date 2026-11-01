/**
 * /api/interview/[jobId]/confirm —— 确认入库题库。
 *
 *   POST  确认这一套押题题写入题库
 *
 * 设计文档 §7 的契约:POST …/confirm → { inserted, skipped, setId }。
 * 请求体:{ starredIndexes?: number[], preview?: boolean, force?: boolean }
 *   - starredIndexes:押题页勾了「重点关注」的题目序号(对应 job.questions 的下标),
 *     入库时这些题直接落成 starred = true —— 入库前题目不在库里,收藏没有落点。
 *   - preview:只算不写。返回「会入库几题 / 会跳过几题」,给二次确认层如实报数用。
 *   - force:用户拍板。整套被判「高度重复」时,默认整套不入库;
 *     用户点了「仍要入库」就带上它 —— 只写入不重复的那几题。
 *
 * 四条硬规则:
 *   1. 题库不共享 —— job.userId 必须等于 session.sub,否则 403。
 *   2. 幂等 —— 任务记着上次入库的套 id,重复确认直接返回那次的结果,不再写第二份。
 *   3. 重复题按题跳过 —— 跨套判重(R1 精确 / R2 近似 / R3 同考点)命中的题不写入,
 *     撞 (userId, fingerprint) 唯一约束的题也跳过;两条都不让整批回滚。
 *   4. 套级拦截 —— 本套与任一既有套的重复率 ≥ 55% 时整套不入库,
 *     除非用户拍板(force)。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getJob, updateJob } from "@/lib/interview/job-store";
import { saveQuestionSet, type CreateQuestionItemInput } from "@/lib/interview/repo";
import {
  dedupeAgainstLibrary,
  loadLibrary,
  type CrossDedupeResult,
} from "@/lib/interview/cross-dedupe";
import { fingerprint } from "@/lib/interview/fingerprint";
import { prisma } from "@/lib/prisma";
import type { InterviewJob, InterviewQuestion } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** 「重点关注」的题目序号 */
  starredIndexes: z.array(z.number().int().min(0)).optional(),
  /** 只算不写:给二次确认层报数用 */
  preview: z.boolean().optional(),
  /** 用户拍板:整套被判高度重复时仍然入库(只保留不重复的题) */
  force: z.boolean().optional(),
});

/**
 * 生成引擎 —— 任务里存着,原样写进题库的 provider 字段。
 *
 * 不用从「引擎说明」的文案里反推:文案是给人看的,改一个字就可能把来源标错。
 */
function providerOf(job: InterviewJob): string {
  return job.provider === "local" ? "local" : "minimax";
}

/** 入库计划:哪些题写进去,哪些题跳过 */
interface WritePlan {
  /** 要写入的题(带原下标 —— 「重点关注」按原下标落) */
  keep: { question: InterviewQuestion; index: number }[];
  /** 跳过的题数 */
  skipped: number;
  /** 套级判重结论 */
  cross: CrossDedupeResult;
}

/**
 * 算「会入库几题 / 会跳过几题」—— 预演一遍写入的结果,一个字节都不写库。
 *
 * 判重口径必须和仓储层的写入**完全一致**,否则二次确认层报的数会跟实际写进去的对不上:
 *   - 跨套判重命中的题(R1 精确 / R2 近似 / R3 同考点)→ 跳过
 *   - 库里已有的指纹 → 跳过(唯一约束会挡)
 *   - 这一套里重复出现的指纹 → 也跳过(前面那道已经占了这个指纹)
 */
async function planWrite(
  userId: string,
  questions: readonly InterviewQuestion[],
): Promise<WritePlan> {
  // 跨套判重:跟题库里已有的题比一遍(换一份简历也可能撞出同一道题)
  const library = await loadLibrary(userId);
  const cross = dedupeAgainstLibrary(questions, library);

  // 库里已有的指纹 —— 只查这个用户自己的题
  const fingerprints = questions.map((q) => fingerprint(q.question));
  const existing = new Set<string>();
  const unique = [...new Set(fingerprints)];
  if (unique.length > 0) {
    const rows = await prisma.questionItem.findMany({
      where: { userId, fingerprint: { in: unique } },
      select: { fingerprint: true },
    });
    for (const row of rows) existing.add(row.fingerprint);
  }

  // 跳过集合 = 跨套判重命中的 + 指纹冲突的(含这一套内部重复出现的指纹)
  const skip = new Set<number>(cross.duplicateIndexes);
  const seen = new Set<string>();
  questions.forEach((q, index) => {
    const fp = fingerprints[index];
    if (existing.has(fp) || seen.has(fp)) skip.add(index);
    else seen.add(fp);
  });

  const keep = questions
    .map((question, index) => ({ question, index }))
    .filter(({ index }) => !skip.has(index));

  return { keep, skipped: skip.size, cross };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.userId !== session.sub) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { starredIndexes = [], preview = false, force = false } = parsed.data;

  // ── 幂等:已经入过库 → 直接返回上次那次的结果,不再写第二份 ──
  if (job.resultSetId) {
    return NextResponse.json({
      inserted: job.resultInserted ?? 0,
      skipped: job.resultSkipped ?? 0,
      setId: job.resultSetId,
      alreadyConfirmed: true,
    });
  }

  // 只有「跑完等确认」的任务能确认
  if (job.status !== "awaiting-confirm") {
    return NextResponse.json({ error: "not_confirmable" }, { status: 409 });
  }

  const questions = job.questions ?? [];
  if (questions.length === 0) {
    return NextResponse.json({ error: "no_questions" }, { status: 409 });
  }

  // ── 算一遍写入计划(跨套判重 + 指纹冲突) ──
  const plan = await planWrite(job.userId, questions);

  // ── 预览:只算不写,给二次确认层如实报数 ──
  if (preview) {
    return NextResponse.json({
      inserted: plan.keep.length,
      skipped: plan.skipped,
      setId: null,
    });
  }

  // 一题都不剩 → 建个空套没有意义
  if (plan.keep.length === 0) {
    return NextResponse.json({ error: "all_duplicate" }, { status: 409 });
  }

  // ── 套级拦截:与某一套的重复率 ≥ 55% → 整套不入库,除非用户拍板 ──
  if (plan.cross.isDuplicate && !force) {
    return NextResponse.json(
      {
        error: "set_duplicate",
        duplicateCount: plan.cross.duplicateCount,
        totalCount: plan.cross.totalCount,
        matchedSet: plan.cross.matchedSet,
      },
      { status: 409 },
    );
  }

  // ── 写入:只写不重复的题 ──
  const starred = new Set(starredIndexes);
  const items: CreateQuestionItemInput[] = plan.keep.map(({ question, index }) => ({
    question: question.question,
    answer: question.answer ?? "",
    topic: question.topic,
    category: question.category,
    difficulty: question.difficulty,
    fingerprint: fingerprint(question.question),
    starred: starred.has(index),
  }));

  const result = await saveQuestionSet({
    userId: session.sub,
    resumeId: job.source.resumeId,
    resumeTitle: job.title,
    provider: providerOf(job),
    items,
  });

  const skipped = plan.skipped + result.skipped;

  // 记住套 id —— 重复点确认时靠它认出「已经入过了」
  updateJob(jobId, {
    status: "confirmed",
    resultSetId: result.set.id,
    resultInserted: result.inserted.length,
    resultSkipped: skipped,
  });

  return NextResponse.json({
    inserted: result.inserted.length,
    skipped,
    setId: result.set.id,
  });
}
