/**
 * 项目卡片流 —— 项目经历以两列卡片呈现,适合作品集类岗位。
 * 与 HTML 端 components/editor/layouts/card-grid.tsx 一一对应。
 */
import { View } from "@react-pdf/renderer";
import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { buildThemeStyles, CONTENT_WIDTH } from "../theme-styles";
import {
  AwardsSection,
  CertificatesSection,
  EducationSection,
  HeaderBlock,
  InterestsSection,
  LanguagesSection,
  makeSectionIndexer,
  PdfDocument,
  ProjectCard,
  ProjectsSection,
  SectionBlock,
  SkillsSection,
  SummarySection,
  WorkSection,
} from "./parts";

export interface PdfLayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

export function PdfCardGrid({ data, theme }: PdfLayoutProps) {
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

  // 卡片两列一行
  const rows: Array<ResumeData["projects"]> = [];
  for (let i = 0; i < data.projects.length; i += 2) rows.push(data.projects.slice(i, i + 2));

  return (
    <PdfDocument data={data} theme={theme}>
      <HeaderBlock data={data} theme={theme} />
      <SummarySection data={data} theme={theme} index={idx("summary")} />
      <WorkSection data={data} theme={theme} index={idx("work")} />

      {data.projects.length > 0 && (
        <SectionBlock title="项目经历" theme={theme} index={idx("projects")}>
          <View>
            {rows.map((row, ri) => (
              <View key={ri} style={s.cardGridRow}>
                {row.map((p) => (
                  <ProjectCard key={p.id} project={p} theme={theme} />
                ))}
              </View>
            ))}
          </View>
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
