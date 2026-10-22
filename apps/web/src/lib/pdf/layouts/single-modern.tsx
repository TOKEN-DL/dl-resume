/**
 * 单栏现代 —— 姓名左对齐,正文同样单列,但整体重心偏左、留白更紧。
 * 与 HTML 端 components/editor/layouts/single-modern.tsx 一一对应。
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
  SkillsSection,
  SummarySection,
  WorkSection,
} from "./parts";

export interface PdfLayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

export function PdfSingleModern({ data, theme }: PdfLayoutProps) {
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
      <WorkSection data={data} theme={theme} index={idx("work")} />
      <ProjectsSection data={data} theme={theme} index={idx("projects")} />
      <EducationSection data={data} theme={theme} index={idx("education")} />
      <SkillsSection data={data} theme={theme} index={idx("skills")} width={CONTENT_WIDTH} />
      <LanguagesSection data={data} theme={theme} index={idx("languages")} />
      <AwardsSection data={data} theme={theme} index={idx("awards")} />
      <CertificatesSection data={data} theme={theme} index={idx("certificates")} />
      <InterestsSection data={data} theme={theme} index={idx("interests")} />
    </PdfDocument>
  );
}
