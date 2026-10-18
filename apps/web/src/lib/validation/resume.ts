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

/**
 * 解析 + 校验 + 兜底默认值.失败时回落到空模板而不抛错,
 * 这样旧版本数据可平滑迁移。
 */
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

export function parseResumeData(raw: string | null | undefined): ResumeData {
  if (!raw) return structuredClone(EMPTY_RESUME_DATA);
  try {
    const obj = JSON.parse(raw);
    const parsed = ResumeDataSchema.safeParse(obj);
    if (parsed.success) return parsed.data;
    return structuredClone(EMPTY_RESUME_DATA);
  } catch {
    return structuredClone(EMPTY_RESUME_DATA);
  }
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