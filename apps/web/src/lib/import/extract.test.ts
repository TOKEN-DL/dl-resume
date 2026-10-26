/**
 * 简历文本抽取测试。
 * 用真实格式的中文/英文简历样本,验证高置信度字段能被正确识别。
 */
import { describe, it, expect } from "vitest";
import { resumeFromText } from "./from-text";
import {
  extractEmail,
  extractPhone,
  extractName,
  extractPeriod,
  splitSections,
  splitEntries,
  extractSkills,
} from "./extract";

// ─── 典型中文简历样本 ───────────────────────────────────────────────
const CN_RESUME = `
张伟
前端开发工程师
手机:13812345678
邮箱:zhangwei@example.com
城市:上海
GitHub:https://github.com/zhangwei
求职意向:高级前端开发工程师

教育背景
2014.09 - 2018.06  北京大学  计算机科学与技术  本科
主修课程:数据结构、操作系统、数据库系统
GPA 3.8/4.0,校级一等奖学金

工作经历
2020.07 - 至今  字节跳动  高级前端工程师
负责创作者中心重构,支撑日活千万级用户
主导 SSR 框架从自研迁移到 Next.js,首屏加载从 3.2s 降到 1.1s
带领 8 人前端团队,建立代码评审流程

2018.07 - 2020.06  美团  前端开发工程师
负责商家后台的组件库建设
推动前端工程化,构建耗时下降 60%

项目经历
2023.03 - 至今  简历生成器  前端负责人
https://github.com/example/resume-builder
基于 React + TypeScript 的开源简历 SaaS
服务 2 万+ 用户,累计生成 15 万份简历

专业技能
精通 TypeScript、React、Next.js
熟练掌握 Node.js、Webpack、Git
了解 Docker、Kubernetes

语言能力
英语:流利(CET-6,雅思 7.5)
日语:基础(N4)

荣誉奖项
2023.10  字节跳动年度优秀员工
2022.06  美团季度之星

证书
AWS Certified Solutions Architect  2024.03

兴趣爱好
跑步、摄影、爵士乐
`;

// ─── 英文简历样本 ───────────────────────────────────────────────────
const EN_RESUME = `
John Smith
Senior Software Engineer
john.smith@example.com | +1 415-555-0132
San Francisco, CA
github.com/johnsmith

SUMMARY
Senior engineer with 8 years of experience building large-scale distributed systems.
Passionate about developer tooling and platform engineering.

EXPERIENCE
2019.03 - 2024.06  Stripe  Senior Software Engineer
Led the migration of the payments service to Go, reducing p99 latency by 45%.
Designed the internal API gateway serving 200+ engineers.

2016.08 - 2019.02  Airbnb  Software Engineer
Built the listing search ranking pipeline in Python.

EDUCATION
2012.09 - 2016.06  Carnegie Mellon University  B.S. Computer Science
GPA 3.9/4.0

SKILLS
Proficient in Go, Python, Kubernetes, PostgreSQL
Familiar with React, TypeScript
Experience with Terraform and AWS

LANGUAGES
English: Native
Spanish: Intermediate

HOBBIES
Rock climbing, chess, cooking
`;

describe("联系方式抽取", () => {
  it("抽邮箱", () => {
    expect(extractEmail(CN_RESUME)).toBe("zhangwei@example.com");
    expect(extractEmail(EN_RESUME)).toBe("john.smith@example.com");
  });

  it("抽手机号(连续 11 位)", () => {
    expect(extractPhone(CN_RESUME)).toBe("13812345678");
  });

  it("抽美式电话", () => {
    expect(extractPhone(EN_RESUME)).toContain("415-555-0132");
  });

  it("没有邮箱时返回空", () => {
    expect(extractEmail("随便一段没有邮箱的文字")).toBe("");
  });
});

describe("姓名抽取", () => {
  it("中文:首行纯中文名", () => {
    expect(extractName(CN_RESUME)).toBe("张伟");
  });

  it("中文:显式标签", () => {
    expect(extractName("个人信息\n姓名:李明华\n邮箱:x@y.com")).toBe("李明华");
  });

  it("中文:称谓后缀", () => {
    expect(extractName("王小红 女士\n产品经理")).toBe("王小红");
  });

  it("英文:首字母大写组合", () => {
    expect(extractName(EN_RESUME)).toBe("John Smith");
  });

  it("不把职位当姓名", () => {
    expect(extractName("Resume\nEngineer")).toBe("");
  });
});

describe("时间区间抽取", () => {
  it("中文年月日区间", () => {
    const p = extractPeriod("2020.07 - 至今");
    expect(p.start).toBe("2020-07");
    expect(p.current).toBe(true);
  });

  it("完整年月区间", () => {
    const p = extractPeriod("2014.09 - 2018.06");
    expect(p.start).toBe("2014-09");
    expect(p.end).toBe("2018-06");
    expect(p.current).toBe(false);
  });

  it("仅年份", () => {
    const p = extractPeriod("2023 字节跳动年度优秀员工");
    expect(p.start).toBe("2023");
  });

  it("英文区间", () => {
    const p = extractPeriod("2019.03 - 2024.06");
    expect(p.start).toBe("2019-03");
    expect(p.end).toBe("2024-06");
  });

  it("无时间返回空", () => {
    const p = extractPeriod("没有时间信息");
    expect(p.start).toBe("");
  });
});

describe("章节切分", () => {
  it("识别中文章节", () => {
    const s = splitSections(CN_RESUME);
    expect(s.has("education")).toBe(true);
    expect(s.has("work")).toBe(true);
    expect(s.has("projects")).toBe(true);
    expect(s.has("skills")).toBe(true);
    expect(s.has("languages")).toBe(true);
    expect(s.has("awards")).toBe(true);
    expect(s.has("certificates")).toBe(true);
    expect(s.has("interests")).toBe(true);
  });

  it("识别英文章节", () => {
    const s = splitSections(EN_RESUME);
    expect(s.has("work")).toBe(true);
    expect(s.has("education")).toBe(true);
    expect(s.has("skills")).toBe(true);
  });

  it("识别英文多词章节标题(WORK EXPERIENCE)", () => {
    const s = splitSections(
      ["JOHN SMITH", "WORK EXPERIENCE", "2019.03 - 2024.06  Stripe  Engineer", "EDUCATION"].join("\n"),
    );
    expect(s.has("work")).toBe(true);
    expect(s.get("work")?.some((l) => /Stripe/.test(l))).toBe(true);
  });

  it("章节标题不会被当成内容行", () => {
    const s = splitSections(CN_RESUME);
    const edu = s.get("education")!;
    expect(edu.some((l) => l.trim() === "教育背景")).toBe(false);
  });
});

describe("条目切分", () => {
  it("按时间区间切分工作经历", () => {
    const s = splitSections(CN_RESUME);
    const entries = splitEntries(s.get("work")!);
    expect(entries.length).toBe(2);
    expect(entries[0].join(" ")).toContain("字节跳动");
    expect(entries[1].join(" ")).toContain("美团");
  });
});

describe("技能抽取", () => {
  it("识别技术栈并推断熟练度", () => {
    const s = splitSections(CN_RESUME);
    const skills = extractSkills(s.get("skills")!);
    const names = skills.map((k) => k.name);
    expect(names).toContain("TypeScript");
    expect(names).toContain("React");
    expect(names).toContain("Next.js");

    const ts = skills.find((k) => k.name === "TypeScript")!;
    expect(ts.level).toBe("expert"); // "精通"

    const docker = skills.find((k) => k.name === "Docker")!;
    expect(docker.level).toBe("beginner"); // "了解"
  });

  it("英文技能等级", () => {
    const s = splitSections(EN_RESUME);
    const skills = extractSkills(s.get("skills")!);
    const go = skills.find((k) => k.name === "Go");
    expect(go).toBeDefined();
    expect(go!.level).toBe("expert"); // Proficient
  });

  it("不会把 Go 匹配进 Google", () => {
    const s = extractSkills(["熟悉 Google Cloud Platform 生态"]);
    expect(s.find((k) => k.name === "Go")).toBeUndefined();
  });
});

describe("resumeFromText — 中文简历完整流程", () => {
  const { data, diagnostics } = resumeFromText(CN_RESUME);

  it("基本信息", () => {
    expect(data.basics.name).toBe("张伟");
    expect(data.basics.email).toBe("zhangwei@example.com");
    expect(data.basics.phone).toBe("13812345678");
    expect(data.basics.label).toBe("高级前端开发工程师");
    expect(data.basics.location).toBe("上海");
  });

  it("无必填缺失", () => {
    expect(diagnostics.missingRequired).toEqual([]);
  });

  it("工作经历 2 条,公司/职位/时间正确", () => {
    expect(data.work).toHaveLength(2);
    expect(data.work[0].company).toBe("字节跳动");
    expect(data.work[0].position).toBe("高级前端工程师");
    expect(data.work[0].period.start).toBe("2020-07");
    expect(data.work[0].period.current).toBe(true);
    expect(data.work[1].company).toBe("美团");
    expect(data.work[1].period.end).toBe("2020-06");
  });

  it("工作描述转成 <ul><li>", () => {
    expect(data.work[0].description).toContain("<li>");
    expect(data.work[0].description).toContain("创作者中心重构");
  });

  it("教育背景 1 条", () => {
    expect(data.education).toHaveLength(1);
    expect(data.education[0].school).toBe("北京大学");
    expect(data.education[0].period.start).toBe("2014-09");
    expect(data.education[0].period.end).toBe("2018-06");
  });

  it("项目经历 1 条 + 链接", () => {
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("简历生成器");
    expect(data.projects[0].url).toBe("https://github.com/example/resume-builder");
  });

  it("技能列表非空", () => {
    expect(data.skills.length).toBeGreaterThan(5);
    expect(data.skills.find((s) => s.name === "TypeScript")!.level).toBe("expert");
  });

  it("语言能力", () => {
    expect(data.languages).toHaveLength(2);
    const en = data.languages.find((l) => l.name.includes("英语"))!;
    expect(en.level).toBe("C2"); // 流利
    const jp = data.languages.find((l) => l.name.includes("日语"))!;
    // "基础(N4)" —— 括号后缀不能把等级查丢(曾经整条丢成空)
    expect(jp.level).toBe("A1");
  });

  it("奖项 + 证书", () => {
    expect(data.awards.length).toBeGreaterThan(0);
    expect(data.awards[0].title).toContain("字节跳动");
    expect(data.certificates.length).toBeGreaterThan(0);
    expect(data.certificates[0].name).toContain("AWS");
  });

  it("兴趣爱好", () => {
    expect(data.interests).toContain("跑步");
  });

  it("诊断信息列出识别到的章节", () => {
    expect(diagnostics.sectionsFound).toContain("work");
    expect(diagnostics.sectionsFound).toContain("education");
    expect(diagnostics.counts.work).toBe(2);
  });
});

describe("resumeFromText — 英文简历完整流程", () => {
  const { data } = resumeFromText(EN_RESUME);

  it("基本信息", () => {
    expect(data.basics.name).toBe("John Smith");
    expect(data.basics.email).toBe("john.smith@example.com");
    expect(data.basics.phone).toBeTruthy();
  });

  it("工作经历", () => {
    expect(data.work).toHaveLength(2);
    expect(data.work[0].company).toBe("Stripe");
    expect(data.work[0].position).toContain("Senior Software Engineer");
    expect(data.work[0].period.start).toBe("2019-03");
    expect(data.work[0].period.end).toBe("2024-06");
  });

  it("教育背景", () => {
    expect(data.education).toHaveLength(1);
    expect(data.education[0].school).toContain("Carnegie Mellon");
  });

  it("技能", () => {
    const names = data.skills.map((s) => s.name);
    expect(names).toContain("Go");
    expect(names).toContain("Python");
    expect(names).toContain("Kubernetes");
  });

  it("语言 native 映射正确", () => {
    const en = data.languages.find((l) => l.name === "English");
    expect(en!.level).toBe("native");
  });

  it("兴趣爱好", () => {
    expect(data.interests).toContain("chess");
  });
});

describe("PDF 抽取文本(单空格分隔,无竖线/制表符)", () => {
  // pdfjs 把一行吐成一个片段时,字段之间只有单空格,
  // 靠"职位特征词"和"学校后缀"定位边界,否则公司/学校名会被切碎。
  const PDF_TEXT = [
    "Zhang Wei",
    "Senior Frontend Engineer",
    "Phone: 13812345678",
    "Email: zhangwei@example.com",
    "Location: Shanghai",
    "",
    "WORK EXPERIENCE",
    "2020.07 - Present ByteDance Senior Frontend Engineer",
    "Led the creator platform rewrite.",
    "2018.07 - 2020.06 Meituan Frontend Engineer",
    "Built the merchant admin component library.",
    "",
    "EDUCATION",
    "2014.09 - 2018.06 Peking University B.S. Computer Science",
    "",
    "LANGUAGES",
    "English: Native",
    "Japanese: Basic",
  ].join("\n");

  const { data } = resumeFromText(PDF_TEXT);

  it("基本信息", () => {
    expect(data.basics.name).toBe("Zhang Wei");
    expect(data.basics.email).toBe("zhangwei@example.com");
    expect(data.basics.location).toBe("Shanghai");
  });

  it("工作经历切分正确", () => {
    expect(data.work).toHaveLength(2);
    expect(data.work[0].company).toBe("ByteDance");
    expect(data.work[0].position).toBe("Senior Frontend Engineer");
    expect(data.work[0].period.current).toBe(true);
    expect(data.work[1].company).toBe("Meituan");
    expect(data.work[1].period.end).toBe("2020-06");
  });

  it("英文学校名不被空格切碎", () => {
    expect(data.education).toHaveLength(1);
    expect(data.education[0].school).toBe("Peking University");
    expect(data.education[0].degree).toBe("B.S.");
    expect(data.education[0].major).toBe("Computer Science");
  });

  it("英文语言等级", () => {
    expect(data.languages.find((l) => l.name === "English")!.level).toBe("native");
    expect(data.languages.find((l) => l.name === "Japanese")!.level).toBe("A1");
  });
});

describe("中文单空格标题行", () => {
  it("公司名 + 职位用空格分隔也能切开", () => {
    const text = [
      "工作经历",
      "2020.07 - 至今 美团 前端开发工程师",
      "负责商家后台建设",
    ].join("\n");
    const { data } = resumeFromText(text);
    expect(data.work[0].company).toBe("美团");
    expect(data.work[0].position).toBe("前端开发工程师");
  });

  it("学校 / 专业 / 学历用空格分隔也能切开", () => {
    const text = ["教育背景", "2014.09 - 2018.06 北京大学 计算机科学与技术 本科"].join("\n");
    const { data } = resumeFromText(text);
    expect(data.education[0].school).toBe("北京大学");
    expect(data.education[0].major).toBe("计算机科学与技术");
    expect(data.education[0].degree).toBe("本科");
  });
});

describe("resumeFromText — 鲁棒性", () => {
  it("空文本返回全空结构而不是崩溃", () => {
    const { data } = resumeFromText("");
    expect(data.basics.name).toBe("");
    expect(data.work).toEqual([]);
  });

  it("纯乱码不产生脏数据", () => {
    const { data } = resumeFromText("!@#$%^&*()_+{}|:<>?\n\n\n\n");
    expect(data.basics.name).toBe("");
    expect(data.basics.email).toBe("");
  });

  it("只有联系方式的极简简历", () => {
    const { data, diagnostics } = resumeFromText("李四\n13800001111\nli@example.com");
    expect(data.basics.name).toBe("李四");
    expect(data.basics.phone).toBe("13800001111");
    expect(diagnostics.missingRequired).toEqual([]);
  });

  it("缺邮箱时诊断报出缺失字段", () => {
    const { diagnostics } = resumeFromText("王五\n前端工程师");
    expect(diagnostics.missingRequired).toContain("邮箱");
  });

  it("超长文本不崩溃", () => {
    const long = CN_RESUME.repeat(50);
    const { data } = resumeFromText(long);
    expect(data.work.length).toBeGreaterThan(0);
  });
});