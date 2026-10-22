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
 * 单栏经典 —— 姓名居中大标题,章节自上而下单列铺开。
 * 存量模板 classic / gold-luxury / elegant-serif / academic 等使用此骨架。
 */
export function SingleClassic({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.singleClassic}`}>
      <HeaderBlock data={data} theme={theme} layout="single-classic" />
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
