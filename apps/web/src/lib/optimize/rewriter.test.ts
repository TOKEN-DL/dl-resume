/**
 * 本地改写器。
 *
 * 重点验证两件事:
 *   1. 只做「能被现有事实支撑」的改动 —— 绝不凭空造数字
 *   2. 改动都有前后对照,报告里能直接展示
 */
import { describe, it, expect } from "vitest";
import { composeSummary, rewriteLocally, visibleText } from "./rewriter";
import { EMPTY_RESUME_DATA, type ResumeData } from "@/lib/validation/resume";

function resume(): ResumeData {
  return {
    basics: {
      name: "陈默",
      label: "前端工程师",
      email: "chenmo@example.com",
      phone: "13800000000",
      gender: "male",
      location: "上海",
      avatar: "",
      summary: "",
    },
    summary: "",
    education: [],
    work: [
      {
        id: "w2",
        company: "云图数据",
        position: "前端工程师",
        period: { start: "2020.07", end: "2022-02", current: false },
        description: "做低代码平台",
      },
      {
        id: "w1",
        company: "星云科技",
        position: "高级前端工程师",
        period: { start: "2022-03", end: "", current: true },
        description: "做组件库",
      },
    ],
    projects: [],
    skills: [
      { id: "s1", name: "Vue", level: "beginner" },
      { id: "s2", name: "React", level: "expert" },
      { id: "s3", name: "Vite", level: "advanced" },
    ],
    languages: [],
    awards: [],
    certificates: [],
    interests: "",
  };
}

describe("composeSummary", () => {
  it("完全用现有字段拼装,不编造事实", () => {
    const s = composeSummary(resume());
    expect(s).toBeTruthy();
    expect(s).toContain("前端工程师");
    expect(s).toContain("星云科技");
    expect(s).toContain("高级前端工程师");
    expect(s).toContain("React");
  });

  it("没有任何可用信息时返回 null(不硬凑)", () => {
    expect(composeSummary(EMPTY_RESUME_DATA)).toBeNull();
  });
});

describe("visibleText", () => {
  it("保留列表的行结构,标签不外露", () => {
    expect(visibleText("<ul><li>第一件事</li><li>第二件事</li></ul>")).toBe(
      "第一件事\n第二件事",
    );
  });

  it("<br> 与 </p> 也算换行", () => {
    expect(visibleText("<p>甲</p><p>乙</p>")).toBe("甲\n乙");
    expect(visibleText("甲<br>乙")).toBe("甲\n乙");
  });

  it("压掉行内多余空白与空行", () => {
    expect(visibleText("<li>  甲   乙  </li>\n\n<li>丙</li>")).toBe("甲 乙\n丙");
  });

  it("实体空格还原成普通空格", () => {
    expect(visibleText("甲&nbsp;乙")).toBe("甲 乙");
  });
});

describe("rewriteLocally", () => {
  it("自我评价为空时用现有字段补一条,并留下前后对照", () => {
    const { optimized, changes } = rewriteLocally(resume());
    expect(optimized.summary).toBeTruthy();
    const c = changes.find((x) => x.target === "summary");
    expect(c).toBeTruthy();
    expect(c!.before).toBe("");
    expect(c!.after).toContain("前端工程师");
  });

  it("自我评价已有内容时不乱改", () => {
    const data = resume();
    data.summary = "我是一个前端工程师";
    const { optimized, changes } = rewriteLocally(data);
    expect(optimized.summary).toBe("我是一个前端工程师");
    expect(changes.find((x) => x.target === "summary")).toBeUndefined();
  });

  it("时间格式被规范化", () => {
    const { optimized } = rewriteLocally(resume());
    expect(optimized.work[0].period.start).toBe("2022-03");
  });

  it("工作经历按时间倒序排列", () => {
    const { optimized } = rewriteLocally(resume());
    expect(optimized.work[0].id).toBe("w1");
  });

  it("技能按掌握程度降序", () => {
    const { optimized } = rewriteLocally(resume());
    expect(optimized.skills.map((s) => s.name)).toEqual(["React", "Vite", "Vue"]);
  });

  it("不会往正文里塞占位符", () => {
    const data = resume();
    data.work[0].description = "";
    const { optimized } = rewriteLocally(data);
    // 改写会按时间重排,所以按 id 找,别依赖下标
    const emptied = optimized.work.find((w) => w.id === "w2")!;
    expect(emptied.description).toBe("");
    expect(optimized.summary).not.toContain("待补充");
    expect(optimized.summary).not.toContain("【");
  });

  it("原简历不被就地修改(返回的是副本)", () => {
    const data = resume();
    const before = JSON.stringify(data);
    rewriteLocally(data);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("列表项里的手工编号会被去掉(<li> 本身就是项目符号)", () => {
    const data = resume();
    data.work[0].description =
      "<ul><li>1. 实现文档入库流水线</li><li>2. 设计结构化输出约束</li></ul>";
    const { optimized, changes } = rewriteLocally(data);
    const w = optimized.work.find((x) => x.id === "w2")!;
    expect(w.description).not.toContain("1.");
    expect(w.description).toContain("实现文档入库流水线");
    const c = changes.find((x) => x.target === "work:w2.description");
    expect(c).toBeTruthy();
    expect(c!.before).toContain("1. 实现文档入库流水线");
    expect(c!.after).not.toContain("1.");
  });

  it("不会误伤「3D 建模」「1.2 版本」这类内容", () => {
    const data = resume();
    data.work[0].description = "<ul><li>3D 建模经验</li><li>1.2 版本迭代</li></ul>";
    const { optimized } = rewriteLocally(data);
    const w = optimized.work.find((x) => x.id === "w2")!;
    expect(w.description).toContain("3D 建模经验");
    expect(w.description).toContain("1.2 版本迭代");
  });

  it("前后对照按行展示(能看出要点被拆开了)", () => {
    const data = resume();
    data.work[0].description =
      "<ul><li>1. 第一件事</li><li>2. 第二件事</li></ul>";
    const { changes } = rewriteLocally(data);
    const c = changes.find((x) => x.target === "work:w2.description");
    expect(c!.after.split("\n")).toHaveLength(2);
  });

  it("只差空白/HTML 的改动不记进对照(用户看不见就是没改)", () => {
    const data = resume();
    data.work[0].description = "<ul><li>  做组件库  </li></ul>";
    const { changes } = rewriteLocally(data);
    expect(changes.find((x) => x.target === "work:w2.description")).toBeUndefined();
  });

  it("排序对照逐行列出,不是顿号连排", () => {
    const { changes } = rewriteLocally(resume());
    const skills = changes.find((x) => x.target === "skills");
    expect(skills).toBeTruthy();
    expect(skills!.after).toContain("\n");
    expect(skills!.after.split("\n")).toHaveLength(3);
  });
});
