/**
 * 押题节点定义(stages)—— 五个节点的名字、顺序与状态文案。
 *
 * 盯四件事:
 *   1. 五个节点的顺序是 扫描 → 出题 → 查重 → 出答案 → 待确认入库
 *   2. 每个节点都能按 key 查到定义
 *   3. 节点状态有五种,都有可读文案
 *   4. 每个节点最短展示 420ms —— 太快了进度条会跳变
 */
import { describe, it, expect } from "vitest";
import { STAGES, STAGE_MAP, STAGE_STATUS_LABEL, MIN_STAGE_MS } from "./stages";

describe("押题节点定义", () => {
  it("五个节点,顺序是 扫描 → 出题 → 查重 → 出答案 → 待确认入库", () => {
    expect(STAGES.map((s) => s.key)).toEqual([
      "scan",
      "generate",
      "dedupe",
      "answer",
      "confirm",
    ]);
    expect(STAGES.map((s) => s.title)).toEqual([
      "简历扫描",
      "出题",
      "查重",
      "出答案",
      "待确认入库",
    ]);
  });

  it("每个节点都能按 key 查到定义", () => {
    expect(STAGE_MAP.scan.title).toBe("简历扫描");
    expect(STAGE_MAP.confirm.title).toBe("待确认入库");
  });

  it("节点状态有五种,都有可读文案", () => {
    expect(Object.keys(STAGE_STATUS_LABEL).sort()).toEqual(
      ["done", "failed", "pending", "running", "skipped"].sort(),
    );
    for (const label of Object.values(STAGE_STATUS_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("每个节点最短展示 420ms —— 太快了进度条会跳变", () => {
    expect(MIN_STAGE_MS).toBe(420);
  });
});
