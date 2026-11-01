/**
 * /api/interview/[jobId] —— 单个押题任务的状态。
 *
 *   GET    轮询进度;任务跑完后一并返回题目
 *   DELETE 取消任务
 *
 * 前端就是靠这个接口做进度条的 —— 页面切走也不影响,任务在服务端跑着,
 * 回来继续轮询同一个 id 就行。
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteJob, getJob, updateJob } from "@/lib/interview/job-store";
import { toInterviewJobSummary } from "@/lib/interview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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

  // 题目只在跑完之后才给 —— 跑的过程中没必要把题干答案来回传
  const done = job.status === "awaiting-confirm" || job.status === "failed";

  return NextResponse.json({
    job: toInterviewJobSummary(job),
    questions: done ? job.questions : undefined,
  });
}

export async function DELETE(
  _req: Request,
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

  if (job.status === "running" || job.status === "queued") {
    updateJob(jobId, { status: "cancelled" });
  }
  deleteJob(jobId);

  return NextResponse.json({ ok: true });
}
