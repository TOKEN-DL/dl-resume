/**
 * /api/optimize/[jobId] —— 单个优化任务的状态。
 *
 *   GET    轮询进度;任务跑完后一并返回报告
 *   DELETE 取消任务
 *
 * 前端就是靠这个接口做进度条的 —— 页面切走也不影响,任务在服务端跑着,
 * 回来继续轮询同一个 id 就行。
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteJob, getJob, updateJob } from "@/lib/optimize/job-store";
import { toJobSummary } from "@/lib/optimize/types";

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

  // 报告只在跑完之后才给 —— 跑的过程中没必要把简历正文来回传
  const done =
    job.status === "awaiting-confirm" ||
    job.status === "confirmed" ||
    job.status === "failed";

  return NextResponse.json({
    job: toJobSummary(job),
    report: done ? job.report : undefined,
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
