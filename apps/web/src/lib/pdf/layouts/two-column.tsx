/**
 * 双栏均衡 —— 头部通栏,正文左右两栏各 50%。
 * 左栏放经历正文,右栏放教育与技能,符合中文简历的阅读习惯。
 * 与 HTML 端 components/editor/layouts/two-column.tsx 一一对应。
 *
 * react-pdf 没有百分比栅格,两栏用固定宽度 View:
 * 每栏 241.64pt(483.28pt 的一半),栏间 12pt 留白。
 */
import { View } from "@react-pdf/renderer";
import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { buildThemeStyles, COLUMN_GAP, COLUMN_WIDTH } from "../theme-styles";
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

export function PdfTwoColumn({ data, theme }: PdfLayoutProps) {
  const s = buildThemeStyles(theme);
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
  const colInner = COLUMN_WIDTH - COLUMN_GAP;

  return (
    <PdfDocument data={data} theme={theme}>
      <View style={s.columnHead}>
        <HeaderBlock data={data} theme={theme} flush />
      </View>

      <View style={s.columnRow}>
        <View style={{ width: COLUMN_WIDTH, paddingRight: COLUMN_GAP }}>
          <SummarySection data={data} theme={theme} index={idx("summary")} />
          <WorkSection data={data} theme={theme} index={idx("work")} />
          <ProjectsSection data={data} theme={theme} index={idx("projects")} />
        </View>
        <View style={{ width: COLUMN_WIDTH, paddingLeft: COLUMN_GAP }}>
          <EducationSection data={data} theme={theme} index={idx("education")} />
          <SkillsSection data={data} theme={theme} index={idx("skills")} width={colInner} />
          <LanguagesSection data={data} theme={theme} index={idx("languages")} />
          <AwardsSection data={data} theme={theme} index={idx("awards")} />
          <CertificatesSection data={data} theme={theme} index={idx("certificates")} />
          <InterestsSection data={data} theme={theme} index={idx("interests")} />
        </View>
      </View>
    </PdfDocument>
  );
}
