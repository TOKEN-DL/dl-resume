/**
 * 后台任务表 + 节点推进。
 *
 * 这是「切页不被打断」的技术底座:任务活在服务端,
 * 浏览器只是轮询它 —— 页面关掉、路由切走,任务照跑。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearJobs,
  createJob,
  deleteJob,
  getJob,
  getJobData,
  listActiveJobs,
  listJobs,
  recomputeProgress,
  updateJob,
} from "./job-store";
import { runJob } from "./runner";
import { STAGES } from "./stages";
import { toJobSummary, type OptimizeJob } from "./types";
import { EMPTY_RESUME_DATA, type ResumeData } from "@/lib/validation/resume";

function makeJob(id: string, userId = "u1", data?: ResumeData): OptimizeJob {
  const now = Date.now();
  const job: OptimizeJob = {
    id,
    userId,
    status: "queued",
    title: "测试简历",
    template: "classic",
    source: { kind: "resume", resumeId: "r1" },
    stages: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  createJob(job, { data: data ?? EMPTY_RESUME_DATA, title: job.title, template: "classic" });
  return job;
}

beforeEach(() => {
  clearJobs();
});

describe("job-store", () => {
  it("建的任务能取回来,连同源数据", () => {
    const job = makeJob("j1");
    expect(getJob("j1")).toBeTruthy();
    expect(getJobData<ResumeData>("j1")).toBeTruthy();
    expect(job.id).toBe("j1");
  });

  it("任务列表按用户隔离", () => {
    makeJob("j1", "u1");
    makeJob("j2", "u2");
    expect(listJobs("u1").map((j) => j.id)).toEqual(["j1"]);
    expect(listJobs("u2").map((j) => j.id)).toEqual(["j2"]);
  });

  it("活跃任务只包含排队/运行/待确认", () => {
    makeJob("j1", "u1");
    updateJob("j1", { status: "confirmed" });
    expect(listActiveJobs("u1")).toEqual([]);

    makeJob("j2", "u1");
    expect(listActiveJobs("u1").map((j) => j.id)).toEqual(["j2"]);
  });

  it("进度按已完成节点数计算", () => {
    const job = makeJob("j1");
    job.stages = STAGES.map((s) => ({ key: s.key, status: "done" }));
    expect(recomputeProgress(job)).toBe(1);

    job.stages = STAGES.map((s, i) => ({
      key: s.key,
      status: i < 2 ? "done" : "pending",
    }));
    expect(recomputeProgress(job)).toBeCloseTo(2 / STAGES.length);
  });

  it("删任务时连源数据一起删", () => {
    makeJob("j1");
    deleteJob("j1");
    expect(getJob("j1")).toBeUndefined();
    expect(getJobData("j1")).toBeUndefined();
  });

  it("摘要不包含简历正文", () => {
    const job = makeJob("j1");
    const summary = toJobSummary(job);
    expect(JSON.stringify(summary)).not.toContain("basics");
    expect(summary.id).toBe("j1");
  });
});

describe("runJob", () => {
  it("跑完六个节点,最终停在「等待确认」并带上报告", async () => {
    makeJob("j1");
    await runJob("j1");

    const job = getJob("j1")!;
    expect(job.status).toBe("awaiting-confirm");
    expect(job.stages.length).toBe(STAGES.length);
    expect(job.stages.every((s) => s.status === "done")).toBe(true);
    expect(job.progress).toBe(1);

    expect(job.report).toBeTruthy();
    expect(job.report!.reviews.length).toBeGreaterThan(0);
    expect(job.report!.plan.length).toBeGreaterThan(0);
    expect(job.report!.optimized).toBeTruthy();
  }, 20000);

  it("每个节点都留下耗时与摘要", async () => {
    makeJob("j2");
    await runJob("j2");
    const job = getJob("j2")!;
    for (const s of job.stages) {
      expect(s.startedAt, s.key).toBeTruthy();
      expect(s.finishedAt, s.key).toBeTruthy();
      expect(s.detail, s.key).toBeTruthy();
    }
  }, 20000);

  it("源数据缺失时任务标记为失败而不是卡住", async () => {
    const now = Date.now();
    createJob(
      {
        id: "j3",
        userId: "u1",
        status: "queued",
        title: "x",
        template: "classic",
        source: { kind: "resume", resumeId: "r1" },
        stages: [],
        progress: 0,
        createdAt: now,
        updatedAt: now,
      },
      { data: undefined, title: "x", template: "classic" },
    );
    await runJob("j3");
    expect(getJob("j3")!.status).toBe("failed");
  }, 20000);
});
