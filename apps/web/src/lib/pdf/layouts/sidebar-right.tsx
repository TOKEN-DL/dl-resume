/**
 * 右侧栏 —— 与左侧栏同构,信息栏挪到右边,主栏在左。
 * 与 HTML 端 components/editor/layouts/sidebar-right.tsx 一一对应。
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

export function PdfSidebarRight({ data, theme }: PdfLayoutProps) {
  const s = buildThemeStyles(theme);
  // 序号按 DOM 顺序算:主栏章节在前,侧栏(证书 / 兴趣爱好)在后
  const idx = makeSectionIndexer(data, [
    "summary",
    "work",
    "projects",
    "education",
    "awards",
    "certificates",
    "interests",
  ]);
  const sideInner = SIDEBAR_WIDTH - 28;

  return (
    <PdfDocument data={data} theme={theme}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: MAIN_WIDTH, paddingLeft: 0, paddingRight: COLUMN_GAP }}>
          <SummarySection data={data} theme={theme} index={idx("summary")} />
          <WorkSection data={data} theme={theme} index={idx("work")} />
          <ProjectsSection data={data} theme={theme} index={idx("projects")} />
          <EducationSection data={data} theme={theme} index={idx("education")} />
          <AwardsSection data={data} theme={theme} index={idx("awards")} />
        </View>

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
      </View>
    </PdfDocument>
  );
}
