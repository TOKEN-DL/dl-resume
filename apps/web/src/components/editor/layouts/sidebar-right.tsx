"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { ContactList, HeaderBlock, LanguageList, SkillList } from "./parts";
import {
  AwardsBlock,
  CertificatesBlock,
  EducationBlock,
  InterestsBlock,
  ProjectsBlock,
  SummaryBlock,
  WorkBlock,
} from "./sections";
import styles from "../templates.module.css";

export interface LayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

/**
 * 右侧栏 —— 与左侧栏同构,信息栏挪到右边,主栏在左。
 * luxury-dark(墨黑鎏金)使用此骨架。
 */
export function SidebarRight({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.sideLayout} ${styles.sideRight}`}>
      <main className={styles.mainCol}>
        <SummaryBlock data={data} theme={theme} />
        <WorkBlock data={data} theme={theme} />
        <ProjectsBlock data={data} theme={theme} />
        <EducationBlock data={data} theme={theme} />
        <AwardsBlock data={data} theme={theme} />
      </main>
      <aside className={styles.side}>
        <HeaderBlock data={data} theme={theme} />
        <div className={styles.sideSection}>
          <h2 className={styles.sideTitle}>联系方式</h2>
          <ContactList data={data} />
        </div>
        {data.skills.length > 0 && (
          <div className={styles.sideSection}>
            <h2 className={styles.sideTitle}>专业技能</h2>
            <SkillList items={data.skills} theme={theme} columns={1} />
          </div>
        )}
        {data.languages.length > 0 && (
          <div className={styles.sideSection}>
            <h2 className={styles.sideTitle}>语言能力</h2>
            <LanguageList items={data.languages} />
          </div>
        )}
        {data.certificates.length > 0 && (
          <div className={styles.sideSection}>
            <CertificatesBlock data={data} theme={theme} />
          </div>
        )}
        {data.interests && (
          <div className={styles.sideSection}>
            <InterestsBlock data={data} theme={theme} />
          </div>
        )}
      </aside>
    </div>
  );
}
