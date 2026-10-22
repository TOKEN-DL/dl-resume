/**
 * 单栏经典 —— 姓名居中大标题,章节自上而下单列铺开。
 * 与 HTML 端 components/editor/layouts/single-classic.tsx 一一对应。
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

export function PdfSingleClassic({ data, theme }: PdfLayoutProps) {
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
      <HeaderBlock data={data} theme={theme} centered />
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
