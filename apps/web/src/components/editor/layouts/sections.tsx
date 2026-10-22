"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import {
  EntryItem,
  LanguageList,
  RichHtml,
  SectionBlock,
  SimpleItem,
  SkillList,
} from "./parts";

/**
 * 章节块 —— 7 个布局骨架共用,只决定「有哪些内容」,
 * 由各骨架决定「放在哪里、怎么排」。
 */

export function SummaryBlock({ data, theme }: { data: ResumeData; theme: ThemeTokens }) {
  if (!data.summary) return null;
  return (
    <SectionBlock title="个人简介" theme={theme}>
      <RichHtml html={data.summary} />
    </SectionBlock>
  );
}

export function WorkBlock({
  data,
  theme,
  title = "工作经历",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.work.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      {data.work.map((w) => (
        <EntryItem
          key={w.id}
          title={w.company}
          subtitle={w.position}
          period={w.period}
        >
          <RichHtml html={w.description} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function EducationBlock({
  data,
  theme,
  title = "教育背景",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.education.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      {data.education.map((e) => (
        <EntryItem
          key={e.id}
          title={e.school}
          subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`}
          period={e.period}
        >
          <RichHtml html={e.description} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function ProjectsBlock({
  data,
  theme,
  title = "项目经历",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.projects.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      {data.projects.map((p) => (
        <EntryItem
          key={p.id}
          title={p.name}
          subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`}
          period={p.period}
        >
          <RichHtml html={p.description} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function SkillsBlock({
  data,
  theme,
  title = "专业技能",
  columns = 2,
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
  columns?: number;
}) {
  if (data.skills.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      <SkillList items={data.skills} theme={theme} columns={columns} />
    </SectionBlock>
  );
}

export function LanguagesBlock({
  data,
  theme,
  title = "语言能力",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.languages.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      <LanguageList items={data.languages} />
    </SectionBlock>
  );
}

export function AwardsBlock({
  data,
  theme,
  title = "荣誉奖项",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.awards.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      {data.awards.map((a) => (
        <SimpleItem
          key={a.id}
          title={a.title}
          meta={`${a.awarder ? a.awarder + " · " : ""}${a.date}`}
        >
          {a.description && <RichHtml html={a.description} />}
        </SimpleItem>
      ))}
    </SectionBlock>
  );
}

export function CertificatesBlock({
  data,
  theme,
  title = "证书",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (data.certificates.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      {data.certificates.map((c) => (
        <SimpleItem
          key={c.id}
          title={c.name}
          meta={`${c.issuer ? c.issuer + " · " : ""}${c.date}`}
        />
      ))}
    </SectionBlock>
  );
}

export function InterestsBlock({
  data,
  theme,
  title = "兴趣爱好",
}: {
  data: ResumeData;
  theme: ThemeTokens;
  title?: string;
}) {
  if (!data.interests) return null;
  return (
    <SectionBlock title={title} theme={theme}>
      <RichHtml html={escapeText(data.interests).replace(/\n/g, "<br/>")} />
    </SectionBlock>
  );
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}
