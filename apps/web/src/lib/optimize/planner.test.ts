/**
 * 方案生成。
 *
 * 重点验证「发现 ↔ 改动」的配对不会张冠李戴:
 * 这是报告里最容易误导用户的地方 —— 一条「要补数字」的问题底下
 * 挂着一段「排序已调整」的对照,用户会以为数字被自动补上了。
 */
import { describe, it, expect } from "vitest";
import { buildPlan, matchChange, markAutoFixed } from "./planner";
import type { Change, ModuleReview } from "./types";

function change(target: string, label = "改动"): Change {
  return { target, label, before: "前", after: "后" };
}

function review(targets: string[]): ModuleReview[] {
  return [
    {
      module: "work",
      label: "工作经历",
      score: 70,
      grade: "fair",
      findings: targets.map((t, i) => ({
        id: `f${i}`,
        module: "work" as const,
        severity: "warn" as const,
        title: `问题 ${t}`,
        detail: "细节",
        suggestion: "建议",
        target: t,
      })),
    },
  ];
}

describe("matchChange", () => {
  it("精确命中", () => {
    const c = change("work:w1.description");
    expect(matchChange("work:w1.description", [c])?.target).toBe("work:w1.description");
  });

  it("粗发现可以命中细改动(字段级)", () => {
    const c = change("basics.label.detail", "求职意向细节");
    expect(matchChange("basics.label", [c])?.target).toBe("basics.label.detail");
  });

  it("裸模块名不认领单条改动(否则报告里会张冠李戴)", () => {
    const one = change("projects:p1.description", "某个项目的描述");
    // 发现说的是「projects 模块整体有问题」,挂一条具体项目的改动是误导
    expect(matchChange("projects", [one])).toBeUndefined();
  });

  it("裸模块名仍能认领同名的整体改动(比如排序)", () => {
    const order = change("projects", "项目经历顺序");
    expect(matchChange("projects", [order])?.target).toBe("projects");
  });

  it("粗改动不得命中细发现(否则报告里会张冠李戴)", () => {
    const order = change("work", "工作经历顺序");
    expect(matchChange("work:w1.description", [order])).toBeUndefined();
  });

  it("不同字段的改动不串台", () => {
    const period = change("work:w1.period", "时间");
    expect(matchChange("work:w1.description", [period])).toBeUndefined();
  });

  it("同时命中多条时取最具体的", () => {
    const coarse = change("work:w1", "整条经历");
    const fine = change("work:w1.description", "工作内容");
    expect(matchChange("work:w1.description", [coarse, fine])?.target).toBe(
      "work:w1.description",
    );
  });

  it("没有 target 的发现不匹配任何改动", () => {
    expect(matchChange(undefined, [change("work")])).toBeUndefined();
  });
});

describe("buildPlan", () => {
  it("没有对应问题的改动单独成条,不会硬塞给某条问题", () => {
    const plan = buildPlan(review(["work:w1.description"]), [
      change("work:w1.description", "工作内容"),
      change("work", "工作经历顺序"),
    ]);

    const desc = plan.find((p) => p.target === "work:w1.description");
    expect(desc?.change?.target).toBe("work:w1.description");

    const order = plan.find((p) => p.change?.target === "work");
    expect(order).toBeTruthy();
    expect(order?.title).toContain("工作经历顺序");
    expect(order?.target).toBe("work");
  });

  it("找不到问题的改动不会重复出现在方案里", () => {
    const plan = buildPlan(review(["work:w1.description"]), [change("work", "顺序")]);
    const hits = plan.filter((p) => p.change?.target === "work");
    expect(hits).toHaveLength(1);
  });

  it("没有改动时,方案就是原始发现", () => {
    const plan = buildPlan(review(["work:w1.description"]), []);
    expect(plan).toHaveLength(1);
    expect(plan[0].change).toBeUndefined();
    expect(plan[0].action).toBe("建议");
  });
});

describe("markAutoFixed", () => {
  it("只给真正被改掉的发现打标", () => {
    const [r] = review(["work:w1.description"]);
    const marked = markAutoFixed([r], [change("work", "工作经历顺序")]);
    expect(marked[0].findings[0].autoFixed).toBeFalsy();
  });

  it("命中具体改动时打标", () => {
    const [r] = review(["work:w1.description"]);
    const marked = markAutoFixed([r], [change("work:w1.description", "工作内容")]);
    expect(marked[0].findings[0].autoFixed).toBe(true);
  });
});
