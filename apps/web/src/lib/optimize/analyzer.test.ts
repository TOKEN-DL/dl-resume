/**
 * 本地规则评价引擎。
 *
 * 这是优化模块的判断内核,测它等于测「体检报告说得对不对」。
 */
import { describe, it, expect } from "vitest";
import { analyzeResume, scoreOf, summarize, MODULE_ORDER } from "./analyzer";
import { EMPTY_RESUME_DATA, type ResumeData } from "@/lib/validation/resume";

/** 一份内容齐全的简历 —— 用来对照「有病」的版本 */
function fullResume(): ResumeData {
  return {
    basics: {
      name: "陈默",
      label: "前端工程师",
      email: "chenmo@example.com",
      phone: "13800000000",
      gender: "male",
      location: "上海",
      avatar: "",
      summary: "8 年前端经验,主导过日活 50 万 的电商平台重构。",
    },
    summary:
      "8 年前端经验,主导过日活 50 万+ 的电商平台重构,熟悉 React / TypeScript / Node.js 全链路。",
    education: [
      {
        id: "e1",
        school: "华东师范大学",
        degree: "本科",
        major: "计算机科学与技术",
        period: { start: "2013-09", end: "2017-06", current: false },
        description: "GPA 3.7/4.0",
      },
    ],
    work: [
      {
        id: "w1",
        company: "星云科技",
        position: "高级前端工程师",
        period: { start: "2022-03", end: "", current: true },
        description:
          "主导组件库 V3 重构,覆盖 12 条业务线,构建耗时下降 60%,日活支撑 50 万+。",
      },
      {
        id: "w2",
        company: "云图数据",
        position: "前端工程师",
        period: { start: "2020-07", end: "2022-02", current: false },
        description: "主导低代码搭建平台,把页面交付周期从 3 天压到 4 小时。",
      },
    ],
    projects: [
      {
        id: "p1",
        name: "统一组件库 V3",
        role: "前端负责人",
        period: { start: "2023-05", end: "2024-01", current: false },
        url: "https://github.com/example/ui",
        description: "主导 12 条业务线接入,构建耗时下降 60%,接入工时减少 70%。",
      },
    ],
    skills: [
      { id: "s1", name: "React", level: "expert" },
      { id: "s2", name: "TypeScript", level: "advanced" },
      { id: "s3", name: "Node.js", level: "intermediate" },
      { id: "s4", name: "Vite", level: "beginner" },
    ],
    languages: [{ id: "l1", name: "英语", level: "C1" }],
    awards: [{ id: "a1", title: "年度技术突破奖", awarder: "星云科技", date: "2023-12", description: "" }],
    certificates: [
      { id: "c1", name: "系统架构设计师", issuer: "工信部", date: "2022-06" },
    ],
    interests: "爬山、摄影。",
  };
}

function findingOf(data: ResumeData, module: string, titlePart: string) {
  const r = analyzeResume(data).find((x) => x.module === module);
  return r?.findings.find((f) => f.title.includes(titlePart));
}

describe("analyzeResume", () => {
  it("每个模块都出一份评价", () => {
    const reviews = analyzeResume(fullResume());
    expect(reviews.map((r) => r.module)).toEqual(MODULE_ORDER);
    expect(reviews.every((r) => typeof r.score === "number")).toBe(true);
  });

  it("内容齐全的简历没有 error 级问题", () => {
    const reviews = analyzeResume(fullResume());
    const errors = reviews.flatMap((r) => r.findings.filter((f) => f.severity === "error"));
    expect(errors.map((e) => e.title)).toEqual([]);
  });

  it("空简历在基础信息上直接报 error", () => {
    const reviews = analyzeResume(EMPTY_RESUME_DATA);
    const basics = reviews.find((r) => r.module === "basics")!;
    expect(basics.findings.some((f) => f.severity === "error")).toBe(true);
    expect(basics.score).toBeLessThan(60);
  });

  it("邮箱格式不对会被抓出来", () => {
    const data = fullResume();
    data.basics.email = "not-an-email";
    const f = findingOf(data, "basics", "邮箱");
    expect(f?.severity).toBe("error");
    expect(f?.target).toBe("basics.email");
  });

  it("工作经历没有描述是 error,没有数字是 warn", () => {
    const data = fullResume();
    data.work[0].description = "";
    expect(findingOf(data, "work", "没有工作内容")?.severity).toBe("error");

    const data2 = fullResume();
    data2.work[0].description = "负责组件库的开发与维护";
    expect(findingOf(data2, "work", "没有量化结果")?.severity).toBe("warn");
  });

  it("以弱动词开头的描述会被点名", () => {
    const data = fullResume();
    data.work[0].description = "负责组件库的开发与维护,覆盖 12 条业务线,耗时下降 60%。";
    const f = findingOf(data, "work", "以「负责」开头");
    expect(f?.severity).toBe("info");
    expect(f?.detail).toContain("负责");
  });

  it("每条发现都带可执行的改法", () => {
    const reviews = analyzeResume(EMPTY_RESUME_DATA);
    for (const r of reviews) {
      for (const f of r.findings) {
        expect(f.suggestion.trim().length, `${f.module}/${f.title}`).toBeGreaterThan(0);
        expect(f.detail.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("目标岗位缺失会被指出来", () => {
    const data = fullResume();
    data.basics.label = "";
    expect(findingOf(data, "basics", "没有求职意向")?.severity).toBe("warn");
  });

  it("技能名太泛会被点名", () => {
    const data = fullResume();
    data.skills = [
      { id: "s1", name: "熟悉", level: "intermediate" },
      { id: "s2", name: "精通", level: "intermediate" },
      { id: "s3", name: "熟练", level: "intermediate" },
    ];
    expect(findingOf(data, "skills", "泛泛的词")).toBeTruthy();
  });
});

describe("scoreOf / summarize", () => {
  it("问题越严重扣分越多", () => {
    const one = (severity: "error" | "warn" | "info") => ({
      id: "x",
      module: "work" as const,
      severity,
      title: "t",
      detail: "d",
      suggestion: "s",
    });
    expect(scoreOf([one("info")])).toBeGreaterThan(scoreOf([one("warn")]));
    expect(scoreOf([one("warn")])).toBeGreaterThan(scoreOf([one("error")]));
  });

  it("分数被夹在 0-100", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `x${i}`,
      module: "work" as const,
      severity: "error" as const,
      title: "t",
      detail: "d",
      suggestion: "s",
    }));
    expect(scoreOf(many)).toBe(0);
    expect(scoreOf([])).toBe(100);
  });

  it("汇总统计各严重度条数", () => {
    const s = summarize(analyzeResume(EMPTY_RESUME_DATA));
    expect(s.errors).toBeGreaterThan(0);
    expect(s.warns).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(100);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});
