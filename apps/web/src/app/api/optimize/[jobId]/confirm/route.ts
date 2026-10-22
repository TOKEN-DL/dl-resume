/**
 * /api/optimize/[jobId]/confirm —— 用户确认后入库。
 *
 * 确认前,原始简历一个字节都不会被动。
 * 确认时用改写后的内容**新建一份简历**(不覆盖原简历),
 * 这样「优化版」和「原版」都能留在历史里对照。
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createResume } from "@/lib/resume-repo";
import { safeStringify } from "@/lib/validation/resume";
import { getJob, updateJob } from "@/lib/optimize/job-store";
import { toJobSummary } from "@/lib/optimize/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  if (job.status === "confirmed") {
    return NextResponse.json({
      ok: true,
      resumeId: job.resultResumeId,
      job: toJobSummary(job),
    });
  }
  if (job.status !== "awaiting-confirm" || !job.report) {
    return NextResponse.json(
      { error: "not_ready", status: job.status },
      { status: 409 },
    );
  }

  const resume = await createResume({
    userId: session.sub,
    title: `${job.title} · 优化版`,
    template: job.template,
    data: safeStringify(job.report.optimized),
  });

  updateJob(jobId, { status: "confirmed", resultResumeId: resume.id });

  return NextResponse.json({
    ok: true,
    resumeId: resume.id,
    job: toJobSummary(getJob(jobId)!),
  });
}
