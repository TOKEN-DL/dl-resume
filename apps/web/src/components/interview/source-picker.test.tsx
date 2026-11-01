// @vitest-environment jsdom
/**
 * SourcePicker —— 押题工作台的「选一份简历」这一段。
 *
 * 盯三件事:
 *   1. 列出历史简历
 *   2. 没有简历时给出提示(而不是白屏)
 *   3. 点「开始押题」把选中的简历交出去
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SourcePicker } from "./source-picker";

const RESUME_ITEMS = [
  { id: "r1", title: "后端工程师简历", template: "classic", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "r2", title: "产品经理简历", template: "classic", updatedAt: "2026-02-01T00:00:00.000Z" },
];

afterEach(() => {
  cleanup();
});

describe("SourcePicker", () => {
  it("列出历史简历", () => {
    render(<SourcePicker resumes={RESUME_ITEMS} busy={false} onStart={() => {}} />);
    expect(screen.getByRole("button", { name: /后端工程师简历/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /产品经理简历/ })).toBeTruthy();
  });

  it("没有简历时给出提示", () => {
    render(<SourcePicker resumes={[]} busy={false} onStart={() => {}} />);
    expect(screen.getByText(/还没有简历/)).toBeTruthy();
  });

  it("点「开始押题」把选中的简历交出去", () => {
    const onStart = vi.fn();
    render(<SourcePicker resumes={RESUME_ITEMS} busy={false} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /产品经理简历/ }));
    fireEvent.click(screen.getByRole("button", { name: "开始押题" }));
    expect(onStart).toHaveBeenCalledWith({ kind: "resume", resumeId: "r2" });
  });
});
