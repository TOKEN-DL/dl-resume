/**
 * JSON Resume ↔ ResumeData 双向映射.
 *
 * 严格遵循 jsonresume.org schema(v1.0.0)。
 * 内部数据缺字段时,导出用空字符串或空数组占位,导入容许缺字段(回落到空值)。
 */
import type { ResumeData } from "@/lib/validation/resume";
import { newId } from "@/lib/validation/resume";

export const JSON_RESUME_SCHEMA_URL = "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";

// ─── Internal → JSON Resume ────────────────────────────────────────
export interface JsonResumeBasics {
  name: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: {
    address?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    region?: string;
  };
  profiles?: Array<{ network: string; username: string; url?: string }>;
}

export interface JsonResumeWork {
  name: string;            // company
  position?: string;
  location?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

export interface JsonResumeEducation {
  institution: string;     // school
  url?: string;
  area?: string;            // major
  studyType?: string;       // degree
  startDate?: string;
  endDate?: string;
  score?: string;
  courses?: string[];
}

export interface JsonResumeProject {
  name: string;
  description?: string;
  highlights?: string[];
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  url?: string;
  roles?: string[];
  entity?: string;
  type?: string;
}

export interface JsonResumeSkill {
  name: string;
  level?: string;
  keywords?: string[];
}

export interface JsonResumeLanguage {
  language: string;
  fluency?: string;
}

export interface JsonResumeAward {
  title: string;
  date?: string;
  awarder?: string;
  summary?: string;
}

export interface JsonResumeCertificate {
  name: string;
  date?: string;
  issuer?: string;
  url?: string;
}

export interface JsonResumeInterest {
  name: string;
  keywords?: string[];
}

export interface JsonResume {
  $schema?: string;
  basics?: JsonResumeBasics;
  work?: JsonResumeWork[];
  education?: JsonResumeEducation[];
  projects?: JsonResumeProject[];
  skills?: JsonResumeSkill[];
  languages?: JsonResumeLanguage[];
  awards?: JsonResumeAward[];
  certificates?: JsonResumeCertificate[];
  interests?: JsonResumeInterest[];
  meta?: {
    version: string;
    lastModified: string;
  };
}

/**
 * 内部 ResumeData → JSON Resume 标准对象.
 * 输出结构符合 jsonresume.org v1.0.0 schema.
 */
export function exportJsonResume(data: ResumeData): JsonResume {
  const out: JsonResume = {
    $schema: JSON_RESUME_SCHEMA_URL,
    basics: {
      name: data.basics.name || "",
      label: data.basics.label || undefined,
      email: data.basics.email || undefined,
      phone: data.basics.phone || undefined,
      summary: data.summary || undefined,
      location: data.basics.location
        ? { city: data.basics.location }
        : undefined,
      profiles: data.basics.avatar && /^https?:\/\//.test(data.basics.avatar)
        ? [{ network: "Avatar", username: "", url: data.basics.avatar }]
        : undefined,
    },
    work: data.work.map((w) => ({
      name: w.company,
      position: w.position || undefined,
      startDate: w.period?.start || undefined,
      endDate: w.period?.current ? undefined : (w.period?.end || undefined),
      summary: stripHtml(w.description) || undefined,
      highlights: extractHighlights(w.description),
    })),
    education: data.education.map((e) => ({
      institution: e.school,
      area: e.major || undefined,
      studyType: e.degree || undefined,
      startDate: e.period?.start || undefined,
      endDate: e.period?.current ? undefined : (e.period?.end || undefined),
      score: stripHtml(e.description) || undefined,
    })),
    projects: data.projects.map((p) => ({
      name: p.name,
      startDate: p.period?.start || undefined,
      endDate: p.period?.current ? undefined : (p.period?.end || undefined),
      url: p.url || undefined,
      description: stripHtml(p.description) || undefined,
      highlights: extractHighlights(p.description),
      roles: p.role ? [p.role] : undefined,
    })),
    skills: data.skills.map((s) => ({
      name: s.name,
      level: s.level || undefined,
    })),
    languages: data.languages.map((l) => ({
      language: l.name,
      fluency: l.level || undefined,
    })),
    awards: data.awards.map((a) => ({
      title: a.title,
      date: a.date || undefined,
      awarder: a.awarder || undefined,
      summary: a.description || undefined,
    })),
    certificates: data.certificates.map((c) => ({
      name: c.name,
      date: c.date || undefined,
      issuer: c.issuer || undefined,
    })),
    interests: data.interests
      ? [{ name: data.interests.split(/[,，、\/\n]/)[0]?.trim() || data.interests, keywords: splitKeywords(data.interests) }]
      : undefined,
    meta: {
      version: "v1.0.0",
      lastModified: new Date().toISOString(),
    },
  };
  return out;
}

// ─── JSON Resume → Internal ────────────────────────────────────────
export interface JsonResumeInput {
  basics?: Partial<JsonResumeBasics>;
  work?: JsonResumeWork[];
  education?: JsonResumeEducation[];
  projects?: JsonResumeProject[];
  skills?: Array<{ name: string; level?: string }>;
  languages?: Array<{ language: string; fluency?: string }>;
  awards?: Array<{ title: string; date?: string; awarder?: string; summary?: string }>;
  certificates?: Array<{ name: string; date?: string; issuer?: string }>;
  interests?: Array<{ name: string; keywords?: string[] }> | string[];
  summary?: string;
}

export class JsonResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonResumeParseError";
  }
}

/**
 * JSON Resume 标准对象 → 内部 ResumeData.
 * 必填字段缺失抛 JsonResumeParseError.
 */
export function importJsonResume(raw: unknown): ResumeData {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new JsonResumeParseError(`invalid JSON: ${msg}`);
    }
  }
  if (!raw || typeof raw !== "object") {
    throw new JsonResumeParseError("payload must be an object");
  }
  const j = raw as JsonResumeInput;

  const basicsOut = j.basics || {};
  const name = (basicsOut.name || "").toString().trim();
  const email = (basicsOut.email || "").toString().trim();

  if (!name) throw new JsonResumeParseError("basics.name is required");
  if (!email) throw new JsonResumeParseError("basics.email is required");

  const data: ResumeData = {
    basics: {
      name,
      label: (basicsOut.label || "").toString(),
      email,
      phone: (basicsOut.phone || "").toString(),
      gender: "",
      location: basicsOut.location?.city || basicsOut.location?.address || "",
      avatar: basicsOut.profiles?.find((p) => p.url)?.url || "",
      summary: (basicsOut.summary || "").toString(),
    },
    summary: j.summary ? `<p>${escapeHtml(j.summary)}</p>` : (basicsOut.summary ? `<p>${escapeHtml(basicsOut.summary)}</p>` : ""),
    education: (j.education || []).map((e) => ({
      id: newId("e"),
      school: e.institution || "",
      degree: e.studyType || "",
      major: e.area || "",
      period: { start: e.startDate || "", end: e.endDate || "", current: false },
      description: e.score || "",
    })),
    work: (j.work || []).map((w) => ({
      id: newId("w"),
      company: w.name || "",
      position: w.position || "",
      period: {
        start: w.startDate || "",
        end: w.endDate || "",
        current: !w.endDate && !!w.startDate,
      },
      description: w.summary || (w.highlights?.length ? `<ul>${w.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""),
    })),
    projects: (j.projects || []).map((p) => ({
      id: newId("p"),
      name: p.name || "",
      role: p.roles?.[0] || "",
      period: {
        start: p.startDate || "",
        end: p.endDate || "",
        current: !p.endDate && !!p.startDate,
      },
      url: p.url || "",
      description: p.description || (p.highlights?.length ? `<ul>${p.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""),
    })),
    skills: (j.skills || []).map((s) => ({
      id: newId("s"),
      name: s.name || "",
      level: mapSkillLevel(s.level) ?? "intermediate",
    })),
    languages: (j.languages || []).map((l) => ({
      id: newId("l"),
      name: l.language || "",
      level: mapLangLevel(l.fluency) as "" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "native",
    })),
    awards: (j.awards || []).map((a) => ({
      id: newId("a"),
      title: a.title || "",
      awarder: a.awarder || "",
      date: a.date || "",
      description: a.summary || "",
    })),
    certificates: (j.certificates || []).map((c) => ({
      id: newId("c"),
      name: c.name || "",
      issuer: c.issuer || "",
      date: c.date || "",
    })),
    interests: formatInterests(j.interests),
  };
  return data;
}

// ─── Helpers ───────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function extractHighlights(html: string): string[] | undefined {
  const out: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripHtml(m[1]).trim();
    if (t) out.push(t);
  }
  return out.length > 0 ? out : undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function mapSkillLevel(level?: string): "beginner" | "intermediate" | "advanced" | "expert" | undefined {
  if (!level) return undefined;
  const l = level.toLowerCase().trim();
  if (l.includes("master") || l.includes("expert") || l === "精通" || l === "高") return "expert";
  if (l.includes("advanced") || l === "advanced" || l === "高") return "advanced";
  if (l.includes("intermediate") || l === "中") return "intermediate";
  if (l.includes("beginner") || l === "初" || l.includes("novice")) return "beginner";
  return undefined;
}

function mapLangLevel(fluency?: string): string {
  if (!fluency) return "";
  const f = fluency.toUpperCase().trim();
  const mapping: Record<string, string> = {
    "NATIVE": "native", "母语": "native",
    "FLUENT": "C2", "精通": "C2",
    "ADVANCED": "C1", "熟练": "C1",
    "INTERMEDIATE": "B2", "中级": "B2",
    "BEGINNER": "A1", "入门": "A1",
  };
  // CEFR passthrough
  if (["A1", "A2", "B1", "B2", "C1", "C2"].includes(f)) return f;
  return mapping[f] || "";
}

function splitKeywords(text: string): string[] {
  return text.split(/[,，、\/\n;；]/).map((s) => s.trim()).filter(Boolean);
}

function formatInterests(interests: JsonResumeInput["interests"]): string {
  if (!interests) return "";
  if (typeof interests === "string") return interests;
  if (Array.isArray(interests)) {
    return interests
      .map((i) => {
        if (typeof i === "string") return i;
        const kws = i.keywords?.length ? `(${i.keywords.join(" / ")})` : "";
        return kws ? `${i.name} ${kws}` : i.name;
      })
      .join("\n");
  }
  return "";
}