/**
 * JSON Resume 双向映射单元测试.
 */
import { describe, it, expect } from "vitest";
import { exportJsonResume, importJsonResume, JsonResumeParseError, JSON_RESUME_SCHEMA_URL } from "./mapping";
import type { ResumeData } from "@/lib/validation/resume";

const sample: ResumeData = {
  basics: {
    name: "李四",
    label: "前端工程师",
    email: "li@example.com",
    phone: "13800138000",
    gender: "",
    location: "上海",
    avatar: "",
    summary: "5 年 React",
  },
  summary: "<p>个人简介 <b>加粗</b> 内容</p>",
  education: [
    {
      id: "e1",
      school: "清华大学",
      degree: "本科",
      major: "计算机",
      period: { start: "2014-09", end: "2018-06", current: false },
      description: "GPA 3.8",
    },
  ],
  work: [
    {
      id: "w1",
      company: "字节跳动",
      position: "高级前端",
      period: { start: "2020-07", end: "", current: true },
      description: "<ul><li>主导 X 项目</li><li>推动 Y 迁移</li></ul>",
    },
  ],
  projects: [
    {
      id: "p1",
      name: "Resume Builder",
      role: "前端负责人",
      period: { start: "2023-01", end: "", current: true },
      url: "https://example.com",
      description: "<p>开源简历 SaaS</p>",
    },
  ],
  skills: [
    { id: "s1", name: "TypeScript", level: "expert" },
    { id: "s2", name: "React", level: "advanced" },
  ],
  languages: [
    { id: "l1", name: "英语", level: "C1" },
  ],
  awards: [
    { id: "a1", title: "字节优秀员工", awarder: "字节", date: "2022", description: "" },
  ],
  certificates: [
    { id: "c1", name: "AWS SAA", issuer: "Amazon", date: "2024" },
  ],
  interests: "阅读 / 跑步",
};

describe("exportJsonResume", () => {
  it("emits $schema URL", () => {
    const j = exportJsonResume(sample);
    expect(j.$schema).toBe(JSON_RESUME_SCHEMA_URL);
  });

  it("maps basics.name/email/label", () => {
    const j = exportJsonResume(sample);
    expect(j.basics?.name).toBe("李四");
    expect(j.basics?.email).toBe("li@example.com");
    expect(j.basics?.label).toBe("前端工程师");
    expect(j.basics?.location?.city).toBe("上海");
  });

  it("maps work items and extracts highlights from <li>", () => {
    const j = exportJsonResume(sample);
    expect(j.work).toHaveLength(1);
    expect(j.work![0].name).toBe("字节跳动");
    expect(j.work![0].position).toBe("高级前端");
    expect(j.work![0].startDate).toBe("2020-07");
    expect(j.work![0].endDate).toBeUndefined(); // current → no endDate
    expect(j.work![0].highlights).toEqual(["主导 X 项目", "推动 Y 迁移"]);
  });

  it("maps education", () => {
    const j = exportJsonResume(sample);
    expect(j.education?.[0].institution).toBe("清华大学");
    expect(j.education?.[0].studyType).toBe("本科");
    expect(j.education?.[0].area).toBe("计算机");
  });

  it("maps projects", () => {
    const j = exportJsonResume(sample);
    expect(j.projects?.[0].name).toBe("Resume Builder");
    expect(j.projects?.[0].url).toBe("https://example.com");
    expect(j.projects?.[0].roles).toEqual(["前端负责人"]);
  });

  it("maps skills with level", () => {
    const j = exportJsonResume(sample);
    expect(j.skills).toEqual([
      { name: "TypeScript", level: "expert" },
      { name: "React", level: "advanced" },
    ]);
  });

  it("maps languages fluency", () => {
    const j = exportJsonResume(sample);
    expect(j.languages).toEqual([{ language: "英语", fluency: "C1" }]);
  });

  it("maps awards and certificates", () => {
    const j = exportJsonResume(sample);
    expect(j.awards![0].title).toBe("字节优秀员工");
    expect(j.awards![0].date).toBe("2022");
    expect(j.awards![0].awarder).toBe("字节");
    expect(j.certificates![0]).toMatchObject({ name: "AWS SAA", date: "2024", issuer: "Amazon" });
  });

  it("formats interests as array", () => {
    const j = exportJsonResume(sample);
    expect(j.interests?.[0].name).toBeDefined();
    expect(j.interests?.[0].keywords).toContain("阅读");
    expect(j.interests?.[0].keywords).toContain("跑步");
  });

  it("emits meta.version + meta.lastModified", () => {
    const j = exportJsonResume(sample);
    expect(j.meta?.version).toBe("v1.0.0");
    expect(j.meta?.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("importJsonResume", () => {
  it("parses a valid JSON Resume object", () => {
    const j = exportJsonResume(sample);
    const back = importJsonResume(j);
    expect(back.basics.name).toBe("李四");
    expect(back.basics.email).toBe("li@example.com");
    expect(back.basics.label).toBe("前端工程师");
    expect(back.work).toHaveLength(1);
    expect(back.work[0].company).toBe("字节跳动");
    expect(back.work[0].period.current).toBe(true);
    expect(back.education[0].school).toBe("清华大学");
    expect(back.skills[0].name).toBe("TypeScript");
    expect(back.languages[0].name).toBe("英语");
    expect(back.interests).toContain("阅读");
  });

  it("accepts a JSON string", () => {
    const j = exportJsonResume(sample);
    const back = importJsonResume(JSON.stringify(j));
    expect(back.basics.name).toBe("李四");
  });

  it("throws JsonResumeParseError on invalid JSON", () => {
    expect(() => importJsonResume("{not-json")).toThrow(JsonResumeParseError);
  });

  it("throws when basics.name is missing", () => {
    expect(() => importJsonResume({ basics: { email: "a@b.com" } })).toThrow(/name/);
  });

  it("throws when basics.email is missing", () => {
    expect(() => importJsonResume({ basics: { name: "X" } })).toThrow(/email/);
  });

  it("reconstructs <ul> HTML from highlights[]", () => {
    const r = importJsonResume({
      basics: { name: "X", email: "a@b.com" },
      work: [
        { name: "Foo", highlights: ["A 成就", "B 成就"] },
      ],
    });
    expect(r.work[0].description).toContain("<li>A 成就</li>");
    expect(r.work[0].description).toContain("<li>B 成就</li>");
  });

  it("maps native fluency to 'native'", () => {
    const r = importJsonResume({
      basics: { name: "X", email: "a@b.com" },
      languages: [{ language: "中文", fluency: "Native" }],
    });
    expect(r.languages[0].level).toBe("native");
  });

  it("handles interests as array of objects", () => {
    const r = importJsonResume({
      basics: { name: "X", email: "a@b.com" },
      interests: [{ name: "运动", keywords: ["篮球", "跑步"] }],
    });
    expect(r.interests).toContain("篮球");
    expect(r.interests).toContain("跑步");
  });
});

describe("round-trip", () => {
  it("preserves core fields across export → import", () => {
    const exported = exportJsonResume(sample);
    const imported = importJsonResume(exported);
    expect(imported.basics.name).toBe(sample.basics.name);
    expect(imported.basics.email).toBe(sample.basics.email);
    expect(imported.work[0].company).toBe(sample.work[0].company);
    expect(imported.skills[0].level).toBe("expert");
    expect(imported.languages[0].level).toBe("C1");
  });
});