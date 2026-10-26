/**
 * Resume data schema + parseResumeData unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_RESUME_DATA,
  ResumeDataSchema,
  BasicsSchema,
  SkillLevel,
  parseResumeData,
  safeStringify,
  newId,
  type ResumeData,
} from "./resume";

describe("ResumeDataSchema — basics", () => {
  it("accepts minimal valid basics", () => {
    const r = BasicsSchema.safeParse({
      name: "张三",
      email: "a@b.com",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.label).toBe("");
      expect(r.data.phone).toBe("");
      expect(r.data.gender).toBe("");
      expect(r.data.avatar).toBe("");
    }
  });

  it("rejects empty name", () => {
    const r = BasicsSchema.safeParse({ name: "  ", email: "a@b.com" });
    expect(r.success).toBe(false);
  });

  it("rejects bad email", () => {
    const r = BasicsSchema.safeParse({ name: "张三", email: "not-email" });
    expect(r.success).toBe(false);
  });

  it("accepts empty string avatar and other optional fields", () => {
    const r = BasicsSchema.safeParse({
      name: "Li",
      email: "a@b.com",
      avatar: "",
      location: "北京",
      label: "Frontend Engineer",
    });
    expect(r.success).toBe(true);
  });
});

describe("ResumeDataSchema — array items", () => {
  it("validates work item requires company", () => {
    const r = ResumeDataSchema.safeParse({
      basics: { name: "Li", email: "a@b.com" },
      work: [{ id: "w1", company: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed date in period.start", () => {
    const r = ResumeDataSchema.safeParse({
      basics: { name: "Li", email: "a@b.com" },
      work: [
        {
          id: "w1",
          company: "Acme",
          period: { start: "not-a-date" },
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("accepts YYYY-MM and YYYY-MM-DD", () => {
    const r = ResumeDataSchema.safeParse({
      basics: { name: "Li", email: "a@b.com" },
      education: [
        {
          id: "e1",
          school: "PKU",
          period: { start: "2018-09", end: "2022-06" },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("skill level is enum-validated", () => {
    expect(SkillLevel.parse("expert")).toBe("expert");
    expect(() => SkillLevel.parse("godlike")).toThrow();
  });

  it("project accepts empty url string", () => {
    const r = ResumeDataSchema.safeParse({
      basics: { name: "Li", email: "a@b.com" },
      projects: [{ id: "p1", name: "Demo", url: "" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("parseResumeData", () => {
  it("returns EMPTY for null/undefined/empty", () => {
    expect(parseResumeData(null)).toEqual(EMPTY_RESUME_DATA);
    expect(parseResumeData(undefined)).toEqual(EMPTY_RESUME_DATA);
    expect(parseResumeData("")).toEqual(EMPTY_RESUME_DATA);
  });

  it("returns EMPTY for invalid JSON without throwing", () => {
    expect(parseResumeData("{not-json")).toEqual(EMPTY_RESUME_DATA);
  });

  it("JSON 能解析但结构不合法时抢救数据,不整份丢弃", () => {
    // 曾经的行为:校验失败直接回空模板 → 用户看到空白简历且毫无提示。
    // 现在:逐字段强转,尽量保住内容。
    const r = parseResumeData(JSON.stringify({ basics: { name: 123, email: "a@b.com" } }));
    expect(r.basics.name).toBe("123");
    expect(r.basics.email).toBe("a@b.com");
  });

  it("坏条目被丢弃,好条目保留", () => {
    const raw = JSON.stringify({
      basics: { name: "李四", email: "a@b.com" },
      work: [
        { id: "w1", company: "" },              // 没有公司名 → 丢弃
        { id: "w2", company: "美团", position: 42 },
        "not-an-object",
      ],
    });
    const r = parseResumeData(raw);
    expect(r.work).toHaveLength(1);
    expect(r.work[0].company).toBe("美团");
    expect(r.work[0].position).toBe("42");
  });

  it("非法枚举值退回默认,不污染其他字段", () => {
    const raw = JSON.stringify({
      basics: { name: "李四", email: "a@b.com", gender: "男" },
      skills: [{ id: "s1", name: "Go", level: "godlike" }],
      languages: [{ id: "l1", name: "英语", level: "C99" }],
    });
    const r = parseResumeData(raw);
    expect(r.basics.gender).toBe("");
    expect(r.skills[0].level).toBe("intermediate");
    expect(r.languages[0].level).toBe("");
  });

  it("非法日期被清空而不是保留垃圾", () => {
    const raw = JSON.stringify({
      basics: { name: "李四", email: "a@b.com" },
      work: [{ id: "w1", company: "美团", period: { start: "去年", end: "2020-6" } }],
    });
    const r = parseResumeData(raw);
    expect(r.work[0].period.start).toBe("");
    expect(r.work[0].period.end).toBe("");
  });

  it("超长字段被截断而不是整体丢弃", () => {
    const longName = "张".repeat(500);
    const raw = JSON.stringify({
      basics: { name: longName, email: "a@b.com" },
      work: [{ id: "w1", company: longName }],
    });
    const r = parseResumeData(raw);
    expect(r.basics.name).toBe("张".repeat(60));
    expect(r.work[0].company).toBe("张".repeat(80));
  });

  it("parses valid JSON and applies defaults", () => {
    const raw = JSON.stringify({
      basics: { name: "Li", email: "a@b.com" },
      work: [{ id: "w1", company: "Acme" }],
    });
    const r = parseResumeData(raw);
    expect(r.basics.name).toBe("Li");
    expect(r.work).toHaveLength(1);
    expect(r.work[0].position).toBe(""); // default
    expect(r.skills).toEqual([]); // default
    expect(r.interests).toBe(""); // default
  });
});

describe("safeStringify", () => {
  it("round-trips through parseResumeData", () => {
    // 复用一个全字段的空模板,只覆盖测试关心的字段。
    // 比手写所有默认字段简短,以后 ResumeData 多了新字段也自动跟得上。
    const d: ResumeData = {
      ...EMPTY_RESUME_DATA,
      basics: { ...EMPTY_RESUME_DATA.basics, name: "李四", email: "l@b.com", label: "FE" },
      summary: "<p>hi</p>",
      work: [{ id: "w1", company: "Foo", position: "", period: { start: "", end: "", current: false }, description: "" }],
      skills: [{ id: "s1", name: "TS", level: "expert" }],
    };
    const raw = safeStringify(d);
    const back = parseResumeData(raw);
    expect(back.basics.name).toBe("李四");
    expect(back.summary).toBe("<p>hi</p>");
    expect(back.work[0].company).toBe("Foo");
    expect(back.skills[0].level).toBe("expert");
  });
});

describe("newId", () => {
  it("returns a non-empty string of expected shape", () => {
    const id = newId("w");
    expect(id.startsWith("w_")).toBe(true);
    expect(id.length).toBeGreaterThan(10);
  });

  it("produces different ids on successive calls", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});