/**
 * 时间轴 —— 经历沿竖向轨道排布,节点用主色圆点标记,
 * 强调「先后顺序」而不是「层级关系」。
 * 与 HTML 端 components/editor/layouts/timeline.tsx 一一对应。
 */
import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { CONTENT_WIDTH } from "../theme-styles";
import {
  AwardsSection,
  CertificatesSection,
  EducationSection,
  HeaderBlock,
  InterestsSection,
  LanguagesSection,
  makeSectionIndexer,
  PdfDocument,
  ProjectsSection,
  SectionBlock,
  SkillsSection,
  SummarySection,
  TimelineList,
} from "./parts";

export interface PdfLayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

export function PdfTimeline({ data, theme }: PdfLayoutProps) {
  const idx = makeSectionIndexer(data, [
    "summary",
    "work",
    "projects",
    "education",
    "skills",
    "languages",
    "awards",
    "certificates",
    "interests",
  ]);

  return (
    <PdfDocument data={data} theme={theme}>
      <HeaderBlock data={data} theme={theme} />
      <SummarySection data={data} theme={theme} index={idx("summary")} />

      {data.work.length > 0 && (
        <SectionBlock title="工作经历" theme={theme} index={idx("work")}>
          <TimelineList
            entries={data.work.map((w) => ({
              id: w.id,
              title: w.company,
              subtitle: w.position,
              period: w.period,
              html: w.description,
            }))}
            theme={theme}
          />
        </SectionBlock>
      )}

      {data.projects.length > 0 && (
        <SectionBlock title="项目经历" theme={theme} index={idx("projects")}>
          <TimelineList
            entries={data.projects.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: `${p.role ?? ""}${p.url ? " · " + p.url : ""}`,
              period: p.period,
              html: p.description,
            }))}
            theme={theme}
          />
        </SectionBlock>
      )}

      <EducationSection data={data} theme={theme} index={idx("education")} />
      <SkillsSection data={data} theme={theme} index={idx("skills")} width={CONTENT_WIDTH} />
      <LanguagesSection data={data} theme={theme} index={idx("languages")} />
      <AwardsSection data={data} theme={theme} index={idx("awards")} />
      <CertificatesSection data={data} theme={theme} index={idx("certificates")} />
      <InterestsSection data={data} theme={theme} index={idx("interests")} />
    </PdfDocument>
  );
}
