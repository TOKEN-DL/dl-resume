// @vitest-environment jsdom
/**
 * ProgressPanel —— 押题跑起来之后的进度面板。
 *
 * 盯两件事:
 *   1. 五个节点都在,带各自的一句话结果
 *   2. 进度条带百分比
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProgressPanel } from "./progress-panel";
import type { InterviewJobSummary } from "@/lib/interview/types";

function makeJobSummary(overrides: Partial<InterviewJobSummary> = {}): InterviewJobSummary {
  return {
    id: "iv_1",
    userId: "u1",
    status: "running",
    title: "后端工程师简历",
    source: { kind: "resume", resumeId: "r1" },
    stages: [
      { key: "scan", status: "done", detail: "识别到 3 个技能 · 2 段项目" },
      { key: "generate", status: "running" },
    ],
    progress: 0.3,
    currentStage: "generate",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("ProgressPanel", () => {
  it("五个节点都在,带各自的一句话结果", () => {
    render(<ProgressPanel job={makeJobSummary()} onDiscard={() => {}} />);
    for (const title of ["简历扫描", "出题", "查重", "出答案", "待确认入库"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("识别到 3 个技能 · 2 段项目")).toBeTruthy();
  });

  it("进度条带百分比", () => {
    render(<ProgressPanel job={makeJobSummary({ progress: 0.3 })} onDiscard={() => {}} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("30");
  });
});
