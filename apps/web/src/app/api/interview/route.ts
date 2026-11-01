/**
 * /api/interview —— 面试押题任务。
 *
 *   POST 创建任务:来源是一份历史简历(id)
 *   GET  列出我的活跃任务(切页回来还能找到之前那个正在跑的)
 *
 * POST 只负责「建任务 + 立刻返回」,真正的出题在后台跑(runner.ts),
 * 所以创建接口不会因为要等模型而卡住。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { assertOwnership, findResumeById } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { createJob, listActiveJobs } from "@/lib/interview/job-store";
import { runJob } from "@/lib/interview/runner";
import { toInterviewJobSummary, type InterviewJob } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 来源是**判别联合**,不是字符串 —— 与优化模块同构。
 * 目前只有「历史简历」这一支;将来要支持「导入新简历」时,加一个分支即可,
 * 不用改调用方的形状。
 */
const bodySchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("resume"),
      resumeId: z.string().trim().min(1).max(64),
    }),
  ]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobs = listActiveJobs(session.sub);
  return NextResponse.json({ jobs: jobs.map(toInterviewJobSummary) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // ── 解析来源 ────────────────────────────────────────────────
  const resumeId = parsed.data.source.resumeId;
  const existing = await findResumeById(resumeId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    await assertOwnership(resumeId, session.sub);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = parseResumeData(existing.data);
  const title = existing.title;

  const now = Date.now();
  const job: InterviewJob = {
    id: `iv_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    userId: session.sub,
    status: "queued",
    title,
    source: { kind: "resume", resumeId },
    stages: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  createJob(job, { data });

  // 不 await —— 任务在后台跑,响应立刻返回
  void runJob(job.id);

  return NextResponse.json({ job: toInterviewJobSummary(job) }, { status: 202 });
}
