/**
 * Resume data schema (JSON Resume inspired, ADR-003).
 * F3: 编辑器表单 + 自动保存 + 预览渲染都依赖这个 schema.
 *
 * 整个 ResumeData 以 JSON 字符串形式存在 Resume.data 列;
 * 本模块负责解析、校验和默认值填充。
 */
import { z } from "zod";

// ─── 基元 ───────────────────────────────────────────────────────────
const trimmedNonEmpty = (max: number) =>
  z.string().trim().min(1, "必填").max(max);

const trimmed = (max: number) =>
  z.string().trim().max(max);

const urlLike = z
  .string()
  .trim()
  .max(500)
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const html = z.string().max(50_000); // 50KB 上限,留余富文本

const dateLike = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2})?(-\d{2})?$|^$/, "日期格式 YYYY 或 YYYY-MM 或 YYYY-MM-DD")
  .max(20);

const dateRange = z
  .object({
    start: dateLike.optional().default(""),
    end: dateLike.optional().default(""),
    current: z.boolean().optional().default(false),
  })
  .strict();

// ─── Basics (F4) ────────────────────────────────────────────────────
export const BasicsSchema = z.object({
  name: trimmedNonEmpty(60),
  label: trimmed(80).optional().default(""),       // 求职意向
  email: z.string().trim().email("邮箱格式不正确").max(120),
  phone: trimmed(40).optional().default(""),
  gender: z.enum(["male", "female", "other", ""]).optional().default(""),
  location: trimmed(80).optional().default(""),
  avatar: trimmed(200_000).optional().default(""), // dataURL, IndexedDB 直传
  summary: trimmed(200).optional().default(""),    // 一句话简介(短)
});
export type Basics = z.infer<typeof BasicsSchema>;

// ─── Summary (F5) 富文本 ────────────────────────────────────────────
export const SummarySchema = html; // 不限制最少,允许空

// ─── Education (F6) ─────────────────────────────────────────────────
export const EducationItemSchema = z.object({
  id: z.string().min(1),
  school: trimmedNonEmpty(80),
  degree: trimmed(40).optional().default(""),
  major: trimmed(60).optional().default(""),
  period: dateRange.optional().default({ start: "", end: "", current: false }),
  description: html.optional().default(""),
});
export type EducationItem = z.infer<typeof EducationItemSchema>;

// ─── Work (F7) ──────────────────────────────────────────────────────
export const WorkItemSchema = z.object({
  id: z.string().min(1),
  company: trimmedNonEmpty(80),
  position: trimmed(60).optional().default(""),
  period: dateRange.optional().default({ start: "", end: "", current: false }),
  description: html.optional().default(""),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

// ─── Projects (F8) ──────────────────────────────────────────────────
export const ProjectItemSchema = z.object({
  id: z.string().min(1),
  name: trimmedNonEmpty(80),
  role: trimmed(60).optional().default(""),
  period: dateRange.optional().default({ start: "", end: "", current: false }),
  url: urlLike,
  description: html.optional().default(""),
});
export type ProjectItem = z.infer<typeof ProjectItemSchema>;

// ─── Skills (F9) ────────────────────────────────────────────────────
export const SkillLevel = z.enum(["beginner", "intermediate", "advanced", "expert"]);
export const SkillItemSchema = z.object({
  id: z.string().min(1),
  name: trimmedNonEmpty(40),
  level: SkillLevel.optional().default("intermediate"),
});
export type SkillItem = z.infer<typeof SkillItemSchema>;

// ─── Languages (F10) ────────────────────────────────────────────────
export const LangLevel = z.enum(["A1", "A2", "B1", "B2", "C1", "C2", "native", ""]);
export const LanguageItemSchema = z.object({
  id: z.string().min(1),
  name: trimmedNonEmpty(40),
  level: LangLevel.optional().default(""),
});
export type LanguageItem = z.infer<typeof LanguageItemSchema>;

// ─── Awards (F11) ───────────────────────────────────────────────────
export const AwardItemSchema = z.object({
  id: z.string().min(1),
  title: trimmedNonEmpty(80),
  awarder: trimmed(80).optional().default(""),
  date: trimmed(20).optional().default(""),
  description: trimmed(500).optional().default(""),
});
export type AwardItem = z.infer<typeof AwardItemSchema>;

// ─── Certificates (F12) ────────────────────────────────────────────
export const CertificateItemSchema = z.object({
  id: z.string().min(1),
  name: trimmedNonEmpty(80),
  issuer: trimmed(80).optional().default(""),
  date: trimmed(20).optional().default(""),
});
export type CertificateItem = z.infer<typeof CertificateItemSchema>;

// ─── Interests (F13) ────────────────────────────────────────────────
export const InterestsSchema = trimmed(1000).optional().default("");

// ─── Top-level ──────────────────────────────────────────────────────
export const ResumeDataSchema = z.object({
  basics: BasicsSchema,
  summary: SummarySchema.optional().default(""),
  education: z.array(EducationItemSchema).optional().default([]),
  work: z.array(WorkItemSchema).optional().default([]),
  projects: z.array(ProjectItemSchema).optional().default([]),
  skills: z.array(SkillItemSchema).optional().default([]),
  languages: z.array(LanguageItemSchema).optional().default([]),
  awards: z.array(AwardItemSchema).optional().default([]),
  certificates: z.array(CertificateItemSchema).optional().default([]),
  interests: InterestsSchema,
});
export type ResumeData = z.infer<typeof ResumeDataSchema>;

/** 全空模板 — 新建简历的初始值,也是 JSON 彻底损坏时的兜底 */
export const EMPTY_RESUME_DATA: ResumeData = {
  basics: {
    name: "",
    label: "",
    email: "",
    phone: "",
    gender: "",
    location: "",
    avatar: "",
    summary: "",
  },
  summary: "",
  education: [],
  work: [],
  projects: [],
  skills: [],
  languages: [],
  awards: [],
  certificates: [],
  interests: "",
};

/**
 * 尽力修复:把任意形状的对象修成符合 ResumeDataSchema 的结构。
 *
 * 为什么需要它 —— 早期实现里校验失败直接返回空模板,后果是:
 * 用户在表单里把邮箱清空 → 自动保存写入 JSON → 下次打开走 parseResumeData
 * → 整份简历变成空白,而且没有任何报错。这属于静默丢数据。
 *
 * 策略:能救的字段全救(强转类型、截断超长、过滤坏条目),
 * 只对真正非法的枚举值退回默认值。
 */
export function repairResumeData(obj: unknown): ResumeData {
  const root = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const b = (root.basics && typeof root.basics === "object" ? root.basics : {}) as Record<string, unknown>;

  const str = (v: unknown, max: number): string => {
    if (typeof v === "string") return v.slice(0, max);
    if (typeof v === "number" && Number.isFinite(v)) return String(v).slice(0, max);
    if (typeof v === "boolean") return String(v).slice(0, max);
    return "";
  };

  const period = (v: unknown) => {
    const p = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const norm = (x: unknown) => {
      const s = str(x, 20);
      return /^\d{4}(-\d{2})?(-\d{2})?$/.test(s) ? s : "";
    };
    return { start: norm(p.start), end: norm(p.end), current: p.current === true };
  };

  /** 取数组;逐条修复后丢弃"主字段为空"的条目 */
  const list = <T,>(v: unknown, limit: number, fix: (raw: Record<string, unknown>, i: number) => T | null): T[] => {
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (let i = 0; i < v.length && out.length < limit; i++) {
      const raw = v[i];
      if (!raw || typeof raw !== "object") continue;
      const item = fix(raw as Record<string, unknown>, i);
      if (item) out.push(item);
    }
    return out;
  };

  const withId = (raw: Record<string, unknown>, i: number, prefix: string) =>
    str(raw.id, 40) || `${prefix}_r${i}`;

  const genderRaw = str(b.gender, 10);
  const gender = (["male", "female", "other", ""] as const).find((g) => g === genderRaw) ?? "";

  const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
  const LANG_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native", ""] as const;

  return {
    basics: {
      name: str(b.name, 60),
      label: str(b.label, 80),
      email: str(b.email, 120),
      phone: str(b.phone, 40),
      gender: gender as "" | "male" | "female" | "other",
      location: str(b.location, 80),
      avatar: str(b.avatar, 200_000),
      summary: str(b.summary, 200),
    },
    summary: str(root.summary, 50_000),
    education: list(root.education, 100, (raw, i) => {
      const school = str(raw.school, 80).trim();
      if (!school) return null;
      return {
        id: withId(raw, i, "e"),
        school,
        degree: str(raw.degree, 40),
        major: str(raw.major, 60),
        period: period(raw.period),
        description: str(raw.description, 50_000),
      };
    }),
    work: list(root.work, 100, (raw, i) => {
      const company = str(raw.company, 80).trim();
      if (!company) return null;
      return {
        id: withId(raw, i, "w"),
        company,
        position: str(raw.position, 60),
        period: period(raw.period),
        description: str(raw.description, 50_000),
      };
    }),
    projects: list(root.projects, 100, (raw, i) => {
      const name = str(raw.name, 80).trim();
      if (!name) return null;
      return {
        id: withId(raw, i, "p"),
        name,
        role: str(raw.role, 60),
        period: period(raw.period),
        url: str(raw.url, 500),
        description: str(raw.description, 50_000),
      };
    }),
    skills: list(root.skills, 200, (raw, i) => {
      const name = str(raw.name, 40).trim();
      if (!name) return null;
      const level = str(raw.level, 20) as (typeof SKILL_LEVELS)[number];
      return {
        id: withId(raw, i, "s"),
        name,
        level: SKILL_LEVELS.includes(level) ? level : "intermediate",
      };
    }),
    languages: list(root.languages, 50, (raw, i) => {
      const name = str(raw.name, 40).trim();
      if (!name) return null;
      const level = str(raw.level, 10) as (typeof LANG_LEVELS)[number];
      return { id: withId(raw, i, "l"), name, level: LANG_LEVELS.includes(level) ? level : "" };
    }),
    awards: list(root.awards, 100, (raw, i) => {
      const title = str(raw.title, 80).trim();
      if (!title) return null;
      return {
        id: withId(raw, i, "a"),
        title,
        awarder: str(raw.awarder, 80),
        date: str(raw.date, 20),
        description: str(raw.description, 500),
      };
    }),
    certificates: list(root.certificates, 100, (raw, i) => {
      const name = str(raw.name, 80).trim();
      if (!name) return null;
      return {
        id: withId(raw, i, "c"),
        name,
        issuer: str(raw.issuer, 80),
        date: str(raw.date, 20),
      };
    }),
    interests: str(root.interests, 1000),
  };
}

/**
 * 解析 + 校验 + 兜底默认值.
 *
 * JSON 本身坏掉才返回空模板;结构对不上则走 repairResumeData 抢救,
 * 避免"一个字段非法 → 整份简历变空白"的静默数据丢失。
 */
export function parseResumeData(raw: string | null | undefined): ResumeData {
  if (!raw) return structuredClone(EMPTY_RESUME_DATA);

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return structuredClone(EMPTY_RESUME_DATA);
  }

  const parsed = ResumeDataSchema.safeParse(obj);
  if (parsed.success) return parsed.data;
  return repairResumeData(obj);
}

export function safeStringify(data: ResumeData): string {
  return JSON.stringify(data);
}

/**
 * 生成稳定 id,用于列表项新增。可选 prefix 提升可读性。
 */
export function newId(prefix = "i"): string {
  // 12 位 base36 时间戳 + 6 位随机 — 概率冲突足够低
  const t = Date.now().toString(36).padStart(12, "0").slice(-12);
  const r = Math.random().toString(36).slice(2, 8).padStart(6, "0").slice(0, 6);
  return `${prefix}_${t}${r}`;
}