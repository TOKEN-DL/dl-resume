/**
 * 后台押题任务表(job-store)—— 内存里的任务与源简历数据。
 *
 * 盯两件事:
 *   1. 任务列表按用户隔离 —— 别人的任务看不到
 *   2. 「活跃任务」只包含排队 / 运行 / 待确认这三种状态
 */
import { describe, it, expect, beforeEach } from "vitest";
import { clearJobs, createJob, listActiveJobs, listJobs, updateJob } from "./job-store";
import type { InterviewJob } from "./types";

/** 造一个任务 */
function makeJob(id: string, userId = "u1"): InterviewJob {
  const now = Date.now();
  const job: InterviewJob = {
    id,
    userId,
    status: "queued",
    title: "测试简历",
    source: { kind: "resume", resumeId: "r1" },
    stages: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  createJob(job, { data: { basics: { label: "后端工程师" } } });
  return job;
}

beforeEach(() => {
  clearJobs();
});

describe("押题任务表", () => {
  it("任务列表按用户隔离", () => {
    makeJob("j1", "u1");
    makeJob("j2", "u2");
    expect(listJobs("u1").map((j) => j.id)).toEqual(["j1"]);
    expect(listJobs("u2").map((j) => j.id)).toEqual(["j2"]);
  });

  it("活跃任务只包含排队/运行/待确认", () => {
    makeJob("j1", "u1");
    updateJob("j1", { status: "cancelled" });
    expect(listActiveJobs("u1")).toEqual([]);

    makeJob("j2", "u1");
    expect(listActiveJobs("u1").map((j) => j.id)).toEqual(["j2"]);
  });
});
