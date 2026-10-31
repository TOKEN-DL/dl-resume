/**
 * 改写协议 —— 模型回补丁,本地打补丁。
 *
 * 盯三件事:
 *   1. 补丁能准确落到对应字段(路径 → id 的换算要对)
 *   2. 没被改动的字段一个都不动(模型漏一条 ≠ 把那条经历删了)
 *   3. 前后对照由本地算,内容确实变了才记
 */
import { describe, it, expect } from "vitest";
import { applyEdits, editableFields } from "./edits";
import { EMPTY_RESUME_DATA, type ResumeData } from "@/lib/validation/resume";
import type { Change } from "../types";

function resume(): ResumeData {
  return {
    ...EMPTY_RESUME_DATA,
    basics: {
      ...EMPTY_RESUME_DATA.basics,
      name: "陈默",
      label: "",
      location: "",
    },
    summary: "<ul><li>1. 五年后端经验</li></ul>",
    work: [
      {
        id: "w1",
        company: "星云科技",
        position: "",
        period: { start: "2022-03", end: "", current: true },
        description: "<ul><li>负责组件库</li></ul>",
      },
      {
        id: "w2",
        company: "云图数据",
        position: "前端工程师",
        period: { start: "2020.07", end: "2022-02", current: false },
        description: "<ul><li>做低代码平台</li></ul>",
      },
    ],
    projects: [
      {
        id: "p1",
        name: "监控助手",
        role: "",
        period: { start: "2023-01", end: "", current: false },
        url: "",
        description: "<ul><li>个人项目</li></ul>",
      },
    ],
  };
}

describe("editableFields", () => {
  it("列出所有可改字段,路径用索引", () => {
    const paths = editableFields(resume()).map((f) => f.path);
    expect(paths).toContain("summary");
    expect(paths).toContain("basics.label");
    expect(paths).toContain("work[0].description");
    expect(paths).toContain("work[1].position");
    expect(paths).toContain("projects[0].description");
  });

  it("target 用 id 而不是索引 —— finding 的 target 是 id 路径", () => {
    const f = editableFields(resume()).find((x) => x.path === "work[0].description");
    expect(f?.target).toBe("work:w1.description");
  });

  it("区分 html 与 text 字段", () => {
    const fields = editableFields(resume());
    expect(fields.find((f) => f.path === "work[0].description")?.kind).toBe("html");
    expect(fields.find((f) => f.path === "work[0].position")?.kind).toBe("text");
  });
});

describe("applyEdits", () => {
  it("补丁准确落到对应条目", () => {
    const { data, changes } = applyEdits(resume(), [
      { path: "work[0].description", after: "<ul><li>主导组件库建设</li></ul>" },
    ]);
    expect(data.work[0].description).toContain("主导组件库建设");
    expect(data.work[1].description).toBe("<ul><li>做低代码平台</li></ul>");
    expect(changes).toHaveLength(1);
    expect(changes[0].target).toBe("work:w1.description");
    expect(changes[0].before).toContain("负责组件库");
    expect(changes[0].after).toContain("主导组件库建设");
  });

  it("没被改的字段一个都不动", () => {
    const before = resume();
    const { data } = applyEdits(before, [
      { path: "basics.label", after: "前端工程师" },
    ]);
    expect(data.work).toHaveLength(2);
    expect(data.projects).toHaveLength(1);
    expect(data.work[0].description).toBe(before.work[0].description);
  });

  it("路径不存在时忽略(模型偶尔会编路径)", () => {
    const { data, changes } = applyEdits(resume(), [
      { path: "work[99].description", after: "乱写" },
      { path: "不存在的字段", after: "乱写" },
    ]);
    expect(changes).toHaveLength(0);
    expect(data.work[0].description).toBe("<ul><li>负责组件库</li></ul>");
  });

  it("空内容视为不改", () => {
    const { changes } = applyEdits(resume(), [
      { path: "work[0].description", after: "   " },
    ]);
    expect(changes).toHaveLength(0);
  });

  it("纯文本没实质变化时不记对照", () => {
    const { changes } = applyEdits(resume(), [
      { path: "work[1].position", after: "前端工程师 " },
    ]);
    expect(changes).toHaveLength(0);
  });

  it("模型回纯文本正文时转成 <ul><li>", () => {
    const { data } = applyEdits(resume(), [
      { path: "work[0].description", after: "主导组件库建设\n推动文档体系" },
    ]);
    expect(data.work[0].description).toBe(
      "<ul><li>主导组件库建设</li><li>推动文档体系</li></ul>",
    );
  });

  it("转 HTML 时顺手去掉手工编号", () => {
    const { data } = applyEdits(resume(), [
      { path: "work[0].description", after: "1. 主导组件库建设" },
    ]);
    expect(data.work[0].description).not.toContain("1.");
  });

  it("纯文本字段不加 HTML 标签", () => {
    const { data } = applyEdits(resume(), [
      { path: "basics.location", after: "上海" },
    ]);
    expect(data.basics.location).toBe("上海");
  });

  it("不改原简历(返回的是副本)", () => {
    const data = resume();
    const before = JSON.stringify(data);
    applyEdits(data, [{ path: "basics.label", after: "前端工程师" }]);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("改动合并(本地 + 模型)", () => {
  it("同一字段两边都改过时合成一条「原样 → 最终」", () => {
    const local: Change[] = [
      { target: "work:w1.description", label: "工作内容", before: "原始", after: "去编号后" },
    ];
    const remote: Change[] = [
      { target: "work:w1.description", label: "工作内容", before: "去编号后", after: "模型改写后" },
    ];

    const seen = new Set(local.map((c) => `${c.target}|${c.after}`));
    const merged: Change[] = [...local];
    for (const rc of remote) {
      const idx = merged.findIndex((c) => c.target === rc.target);
      if (idx >= 0) {
        merged[idx] = { ...rc, before: merged[idx].before };
        continue;
      }
      if (!seen.has(`${rc.target}|${rc.after}`)) merged.push(rc);
    }

    expect(merged).toHaveLength(1);
    expect(merged[0].before).toBe("原始");
    expect(merged[0].after).toBe("模型改写后");
  });

  it("不同字段的改动各留各的", () => {
    const local: Change[] = [
      { target: "work:w1.description", label: "a", before: "1", after: "2" },
    ];
    const remote: Change[] = [
      { target: "summary", label: "b", before: "3", after: "4" },
    ];
    const merged = [...local, ...remote];
    expect(merged).toHaveLength(2);
  });
});
