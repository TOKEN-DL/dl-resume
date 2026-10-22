/**
 * 左侧栏 —— 侧栏放身份信息与技能,主栏放经历正文。
 * 与 HTML 端 components/editor/layouts/sidebar-left.tsx 一一对应。
 *
 * react-pdf 没有百分比栅格,侧栏 / 主栏用固定宽度 View:
 * 侧栏 164pt(约 34%),主栏 319.28pt,两栏合计 483.28pt = A4 正文可用宽度。
 */
import { Text, View } from "@react-pdf/renderer";
import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { buildThemeStyles, COLUMN_GAP, MAIN_WIDTH, SIDEBAR_WIDTH } from "../theme-styles";
import {
  AwardsSection,
  CertificatesSection,
  ContactList,
  EducationSection,
  HeaderBlock,
  InterestsSection,
  LanguageList,
  makeSectionIndexer,
  PdfDocument,
  ProjectsSection,
  SkillList,
  SummarySection,
  WorkSection,
} from "./parts";

export interface PdfLayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

export function PdfSidebarLeft({ data, theme }: PdfLayoutProps) {
  const s = buildThemeStyles(theme);
  // 序号按 DOM 顺序算:侧栏(证书 / 兴趣爱好)在前,主栏章节在后
  const idx = makeSectionIndexer(data, [
    "certificates",
    "interests",
    "summary",
    "work",
    "projects",
    "education",
    "awards",
  ]);
  const sideInner = SIDEBAR_WIDTH - 28; // 减去侧栏左右内边距

  return (
    <PdfDocument data={data} theme={theme}>
      <View style={{ flexDirection: "row" }}>
        <View style={s.sidePanel}>
          <HeaderBlock data={data} theme={theme} flush />
          <View style={s.sideSection}>
            <Text style={s.sideTitle}>联系方式</Text>
            <ContactList data={data} theme={theme} />
          </View>
          {data.skills.length > 0 && (
            <View style={s.sideSection}>
              <Text style={s.sideTitle}>专业技能</Text>
              <SkillList items={data.skills} theme={theme} columns={1} width={sideInner} />
            </View>
          )}
          {data.languages.length > 0 && (
            <View style={s.sideSection}>
              <Text style={s.sideTitle}>语言能力</Text>
              <LanguageList items={data.languages} theme={theme} />
            </View>
          )}
          <CertificatesSection data={data} theme={theme} index={idx("certificates")} />
          <InterestsSection data={data} theme={theme} index={idx("interests")} />
        </View>

        <View style={{ width: MAIN_WIDTH, paddingLeft: COLUMN_GAP }}>
          <SummarySection data={data} theme={theme} index={idx("summary")} />
          <WorkSection data={data} theme={theme} index={idx("work")} />
          <ProjectsSection data={data} theme={theme} index={idx("projects")} />
          <EducationSection data={data} theme={theme} index={idx("education")} />
          <AwardsSection data={data} theme={theme} index={idx("awards")} />
        </View>
      </View>
    </PdfDocument>
  );
}
