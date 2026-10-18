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

  it("returns EMPTY for structurally wrong data without throwing", () => {
    expect(parseResumeData(JSON.stringify({ basics: { name: 123 } }))).toEqual(
      EMPTY_RESUME_DATA,
    );
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
    const d: any = {
      basics: { name: "李四", email: "l@b.com", label: "FE" },
      summary: "<p>hi</p>",
      work: [{ id: "w1", company: "Foo" }],
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