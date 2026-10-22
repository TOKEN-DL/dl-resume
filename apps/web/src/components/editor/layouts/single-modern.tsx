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
 * 单栏现代 —— 姓名左对齐,正文同样单列,但整体重心偏左、留白更紧。
 * 存量模板 modern / minimal / gray-underline / tech-gradient 等使用此骨架。
 */
export function SingleModern({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.singleModern}`}>
      <HeaderBlock data={data} theme={theme} layout="single-modern" />
      <SummaryBlock data={data} theme={theme} />
      <WorkBlock data={data} theme={theme} />
      <ProjectsBlock data={data} theme={theme} />
      <EducationBlock data={data} theme={theme} />
      <SkillsBlock data={data} theme={theme} />
      <LanguagesBlock data={data} theme={theme} />
      <AwardsBlock data={data} theme={theme} />
      <CertificatesBlock data={data} theme={theme} />
      <InterestsBlock data={data} theme={theme} />
    </div>
  );
}
