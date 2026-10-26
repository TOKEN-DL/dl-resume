/**
 * 文本 → ResumeData 组装。
 *
 * splitSections / extractPeriod 等原语在 extract.ts,
 * 这里负责把它们按章节拼成完整的 ResumeData,并做保守兜底:
 * 任何拿不准的字段都留空,交给用户在编辑器里补。
 */
import { newId, type ResumeData } from "@/lib/validation/resume";
import {
  splitSections,
  splitEntries,
  extractPeriod,
  extractEmail,
  extractPhone,
  extractName,
  extractSkills,
  extractLanguages,
  findTitleParts,
  joinEntryDescription,
  mergeWrappedLines,
  stripListNumber,
  extractLabel,
  LABEL_PATTERNS,
  type Period,
} from "./extract";

export interface ImportResult {
  data: ResumeData;
  /** 抽取过程的诊断信息,用于 UI 提示"哪些字段没能自动识别" */
  diagnostics: {
    sectionsFound: string[];
    counts: Record<string, number>;
    missingRequired: string[];
  };
}

const EMPTY = (): ResumeData => ({
  basics: { name: "", label: "", email: "", phone: "", gender: "", location: "", avatar: "", summary: "" },
  summary: "",
  education: [],
  work: [],
  projects: [],
  skills: [],
  languages: [],
  awards: [],
  certificates: [],
  interests: "",
});

/**
 * 从纯文本构建 ResumeData。
 * 这是三种格式(PDF/Word/Markdown)的共同入口 ——
 * 它们只负责把文件变成纯文本,剩下的逻辑完全一致。
 */
export function resumeFromText(text: string): ImportResult {
  const data = EMPTY();
  const sections = splitSections(text);
  const counts: Record<string, number> = {};

  // ── 基本信息:全文扫描(简历头部通常没章节标题) ────────────────
  const headText = sections.get("basic")?.join("\n") ?? "";
  const fullText = text;

  data.basics.email = extractEmail(fullText);
  data.basics.phone = extractPhone(fullText);
  data.basics.name = extractName(headText || fullText.split("\n").slice(0, 8).join("\n"));

  // 求职意向
  data.basics.label = extractLabel(fullText, LABEL_PATTERNS.desiredPosition);
  // 一句话简介(基本信息区里的)
  data.basics.summary = extractLabel(headText || fullText, LABEL_PATTERNS.oneLine, 100);

  // 所在地:统一走 LABEL_PATTERNS.location,避免两处正则漂移
  data.basics.location = extractLabel(fullText, LABEL_PATTERNS.location, 30);

  // ── 个人简介 ────────────────────────────────────────────────
  // 原文里混着 PDF 的排版换行("…两个项目，覆\n盖 RAG…"),先还原成逻辑行,
  // 但编号分段之间的换行要留着 —— 它是真实分段。
  const summaryLines = sections.get("summary");
  if (summaryLines && summaryLines.length > 0) {
    const merged = mergeWrappedLines(summaryLines);
    data.summary = `<p>${escapeHtml(merged.join("\n"))}</p>`;
    counts.summary = merged.length;
  }

  // ── 工作经历 ────────────────────────────────────────────────
  const workLines = sections.get("work");
  if (workLines) {
    const entries = splitEntries(workLines);
    data.work = entries.map((entry) => {
      const full = entry.join("\n");
      const period: Period = extractPeriod(full);
      const { first, second } = findTitleParts(entry, "work");
      return {
        id: newId("w"),
        company: first || "",
        position: second || "",
        period: { start: period.start, end: period.end, current: period.current },
        description: joinEntryDescription(entry),
      };
    }).filter((w) => w.company || w.position);
    counts.work = data.work.length;
  }

  // ── 教育背景 ────────────────────────────────────────────────
  const eduLines = sections.get("education");
  if (eduLines) {
    const entries = splitEntries(eduLines);
    data.education = entries.map((entry) => {
      const full = entry.join("\n");
      const period: Period = extractPeriod(full);
      const { first, second, third } = findTitleParts(entry, "education");
      return {
        id: newId("e"),
        school: first || "",
        degree: second || "",
        major: third || "",
        period: { start: period.start, end: period.end, current: period.current },
        description: "",
      };
    }).filter((e) => e.school);
    counts.education = data.education.length;
  }

  // ── 项目经历 ────────────────────────────────────────────────
  const projLines = sections.get("projects");
  if (projLines) {
    const entries = splitEntries(projLines);
    data.projects = entries.map((entry) => {
      const full = entry.join("\n");
      const period: Period = extractPeriod(full);
      const { first, second } = findTitleParts(entry, "project");
      const url = full.match(/https?:\/\/[^\s，,。；;）)】\]"'<>]+/);
      return {
        id: newId("p"),
        name: first || "",
        role: second || "",
        period: { start: period.start, end: period.end, current: period.current },
        url: url ? url[0] : "",
        description: joinEntryDescription(entry),
      };
    }).filter((p) => p.name);
    counts.projects = data.projects.length;
  }

  // ── 技能 ────────────────────────────────────────────────────
  const skillLines = sections.get("skills");
  if (skillLines) {
    const skills = extractSkills(skillLines);
    data.skills = skills.map((s) => ({ id: newId("s"), name: s.name, level: s.level }));
    counts.skills = data.skills.length;
  }

  // ── 语言 ────────────────────────────────────────────────────
  const langLines = sections.get("languages");
  if (langLines) {
    const langs = extractLanguages(langLines);
    // 抽取阶段只能保证 lvl 是字符串,这里把它收口到 LangLevel 允许的枚举,
    // 取不到合法值就退化成空串(下游 schema 默认值)。
    const LANG_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native", ""] as const;
    type LangLevel = (typeof LANG_LEVELS)[number];
    data.languages = langs.map((l) => {
      const raw = l.level || "";
      const level: LangLevel = (LANG_LEVELS as readonly string[]).includes(raw)
        ? (raw as LangLevel)
        : "";
      return {
        id: newId("l"),
        name: l.name,
        level,
      };
    });
    counts.languages = data.languages.length;
  }

  // ── 奖项 ────────────────────────────────────────────────────
  const awardLines = sections.get("awards");
  if (awardLines) {
    const entries = splitEntries(awardLines);
    data.awards = entries.map((entry) => {
      const full = entry.join("\n");
      const date = full.match(/(20\d{2})(?:\s*[.\-/年]\s*(\d{1,2}))?/);
      const title = stripListNumber(
        entry[0].replace(/(20\d{2})(?:\s*[.\-/年]\s*(\d{1,2}))?/g, "").trim(),
      ) || stripListNumber(entry[0]);
      return {
        id: newId("a"),
        title,
        awarder: "",
        date: date ? (date[2] ? `${date[1]}-${date[2].padStart(2, "0")}` : date[1]) : "",
        description: entry.slice(1).join("\n"),
      };
    }).filter((a) => a.title);
    counts.awards = data.awards.length;
  }

  // ── 证书 ────────────────────────────────────────────────────
  // 证书是一行一条的列表,不含时间区间,靠 splitEntries 区分不了边界
  // (splitSections 已经丢掉空行)。先还原排版换行,再一行一条。
  const certLines = sections.get("certificates");
  if (certLines) {
    const entries = mergeWrappedLines(certLines).map((l) => [l]);
    data.certificates = entries.map((entry) => {
      const full = entry[0];
      const name = stripListNumber(full);
      const date = name.match(/(20\d{2})(?:\s*[.\-/年]\s*(\d{1,2}))?/);
      return {
        id: newId("c"),
        name,
        issuer: "",
        date: date ? (date[2] ? `${date[1]}-${date[2].padStart(2, "0")}` : date[1]) : "",
      };
    }).filter((c) => c.name);
    counts.certificates = data.certificates.length;
  }

  // ── 兴趣 ────────────────────────────────────────────────────
  const interestLines = sections.get("interests");
  if (interestLines) {
    data.interests = interestLines.join(" ").trim();
    counts.interests = 1;
  }

  // ── 诊断 ────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!data.basics.name) missing.push("姓名");
  if (!data.basics.email) missing.push("邮箱");

  return {
    data,
    diagnostics: {
      sectionsFound: [...sections.keys()],
      counts,
      missingRequired: missing,
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}