/**
 * /api/optimize —— 简历优化任务。
 *
 *   POST 创建任务:来源可以是历史简历(id)或刚导入的结构化内容(data)
 *   GET  列出我的任务(切页回来还能找到之前那个正在跑的)
 *
 * POST 只负责「建任务 + 立刻返回」,真正的优化在后台跑(runner.ts),
 * 所以创建接口不会因为要等模型而卡住。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { assertOwnership, findResumeById } from "@/lib/resume-repo";
import { isTemplateId } from "@/lib/templates";
import { parseResumeData, repairResumeData } from "@/lib/validation/resume";
import { createJob, listJobs } from "@/lib/optimize/job-store";
import { runJob } from "@/lib/optimize/runner";
import { toJobSummary, type OptimizeJob } from "@/lib/optimize/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("resume"),
      resumeId: z.string().trim().min(1).max(64),
    }),
    z.object({
      kind: z.literal("upload"),
      title: z.string().trim().max(120).optional(),
      template: z.string().trim().max(60).optional(),
      fileName: z.string().trim().max(200).optional(),
      data: z.unknown(),
    }),
  ]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobs = listJobs(session.sub);
  return NextResponse.json({ jobs: jobs.map(toJobSummary) });
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
  let data: ReturnType<typeof parseResumeData>;
  let title: string;
  let template: string;
  let fileName: string | undefined;
  let resumeId: string | undefined;

  if (parsed.data.source.kind === "resume") {
    resumeId = parsed.data.source.resumeId;
    const existing = await findResumeById(resumeId);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    try {
      await assertOwnership(resumeId, session.sub);
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    data = parseResumeData(existing.data);
    title = existing.title;
    template = existing.template;
  } else {
    const src = parsed.data.source;
    data = repairResumeData(src.data);
    template = src.template ?? "classic";
    if (!isTemplateId(template)) {
      return NextResponse.json({ error: `未知模板: ${template}` }, { status: 400 });
    }
    title = src.title?.trim() || data.basics.name.trim() || "导入的简历";
    fileName = src.fileName;
  }

  const now = Date.now();
  const job: OptimizeJob = {
    id: `opt_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    userId: session.sub,
    status: "queued",
    title,
    template,
    source: { kind: parsed.data.source.kind, resumeId, fileName },
    stages: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  createJob(job, { data, title, template });

  // 不 await —— 任务在后台跑,响应立刻返回
  void runJob(job.id);

  return NextResponse.json({ job: toJobSummary(job) }, { status: 202 });
}
