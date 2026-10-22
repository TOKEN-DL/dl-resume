import { describe, it, expect } from "vitest";
import { ResumeDataSchema } from "@/lib/validation/resume";
import { SAMPLE_PROFESSIONAL, SAMPLE_STUDENT, SAMPLE_CREATIVE } from "./samples";

const ALL = {
  SAMPLE_PROFESSIONAL,
  SAMPLE_STUDENT,
  SAMPLE_CREATIVE,
};

describe("sample resumes", () => {
  it("三份范文都通过 schema 校验", () => {
    for (const [name, s] of Object.entries(ALL)) {
      const r = ResumeDataSchema.safeParse(s);
      expect(r.success, `${name}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("姓名、职位、联系方式非空", () => {
    for (const [name, s] of Object.entries(ALL)) {
      expect(s.basics.name, name).not.toBe("");
      expect(s.basics.label, name).not.toBe("");
      expect(s.basics.email, name).not.toBe("");
      expect(s.basics.phone, name).not.toBe("");
      expect(s.basics.location, name).not.toBe("");
    }
  });

  it("至少包含工作或项目、学历、技能", () => {
    for (const [name, s] of Object.entries(ALL)) {
      expect(s.work.length + s.projects.length, name).toBeGreaterThan(0);
      expect(s.education.length, name).toBeGreaterThan(0);
      expect(s.skills.length, name).toBeGreaterThan(0);
      expect(s.languages.length, name).toBeGreaterThan(0);
    }
  });

  it("三份范文的条目 id 互不重复", () => {
    const ids = Object.values(ALL).flatMap((s) => [
      ...s.work.map((x) => x.id),
      ...s.education.map((x) => x.id),
      ...s.projects.map((x) => x.id),
      ...s.skills.map((x) => x.id),
      ...s.languages.map((x) => x.id),
      ...s.awards.map((x) => x.id),
      ...s.certificates.map((x) => x.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("描述里的富文本是合法 HTML 片段(不含 script)", () => {
    for (const [name, s] of Object.entries(ALL)) {
      const html = [
        s.summary,
        ...s.work.map((w) => w.description),
        ...s.projects.map((p) => p.description),
        ...s.education.map((e) => e.description),
      ].join("");
      expect(html.toLowerCase().includes("<script"), name).toBe(false);
      expect(html.length, name).toBeGreaterThan(0);
    }
  });
});
