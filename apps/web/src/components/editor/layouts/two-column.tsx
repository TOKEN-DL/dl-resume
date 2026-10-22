"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { HeaderBlock } from "./parts";
import {
  AwardsBlock,
  CertificatesBlock,
  EducationBlock,
  InterestsBlock,
  LanguagesBlock,
  ProjectsBlock,
  SkillsBlock,
  SummaryBlock,
  WorkBlock,
} from "./sections";
import styles from "../templates.module.css";

export interface LayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

/**
 * 双栏均衡 —— 头部通栏,正文左右两栏各 50%。
 * 左栏放经历正文,右栏放教育与技能,符合中文简历的阅读习惯。
 */
export function TwoColumn({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.twoCol}`}>
      <div className={styles.twoColHead}>
        <HeaderBlock data={data} theme={theme} />
      </div>
      <div className={styles.twoColGrid}>
        <div className={styles.twoColItem}>
          <SummaryBlock data={data} theme={theme} />
          <WorkBlock data={data} theme={theme} />
          <ProjectsBlock data={data} theme={theme} />
        </div>
        <div className={styles.twoColItem}>
          <EducationBlock data={data} theme={theme} />
          <SkillsBlock data={data} theme={theme} />
          <LanguagesBlock data={data} theme={theme} />
          <AwardsBlock data={data} theme={theme} />
          <CertificatesBlock data={data} theme={theme} />
          <InterestsBlock data={data} theme={theme} />
        </div>
      </div>
    </div>
  );
}
