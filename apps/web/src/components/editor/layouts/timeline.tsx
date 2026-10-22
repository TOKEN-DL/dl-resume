"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { EntryItem, HeaderBlock, RichHtml, SectionBlock } from "./parts";
import {
  AwardsBlock,
  CertificatesBlock,
  EducationBlock,
  InterestsBlock,
  LanguagesBlock,
  ProjectsBlock,
  SkillsBlock,
  SummaryBlock,
} from "./sections";
import styles from "../templates.module.css";

export interface LayoutProps {
  data: ResumeData;
  theme: ThemeTokens;
}

/**
 * 时间轴 —— 经历沿竖向轨道排布,节点用主色圆点标记,
 * 强调「先后顺序」而不是「层级关系」。
 */
export function Timeline({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.timelineSheet}`}>
      <HeaderBlock data={data} theme={theme} layout="timeline" />
      <SummaryBlock data={data} theme={theme} />

      {data.work.length > 0 && (
        <SectionBlock title="工作经历" theme={theme}>
          <div className={styles.timeline}>
            {data.work.map((w) => (
              <div key={w.id} className={styles.timelineItem}>
                <span className={styles.timelineNode} aria-hidden />
                <EntryItem
                  title={w.company}
                  subtitle={w.position}
                  period={w.period}
                >
                  <RichHtml html={w.description} />
                </EntryItem>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {data.projects.length > 0 && (
        <SectionBlock title="项目经历" theme={theme}>
          <div className={styles.timeline}>
            {data.projects.map((p) => (
              <div key={p.id} className={styles.timelineItem}>
                <span className={styles.timelineNode} aria-hidden />
                <EntryItem
                  title={p.name}
                  subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`}
                  period={p.period}
                >
                  <RichHtml html={p.description} />
                </EntryItem>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      <EducationBlock data={data} theme={theme} />
      <SkillsBlock data={data} theme={theme} />
      <LanguagesBlock data={data} theme={theme} />
      <AwardsBlock data={data} theme={theme} />
      <CertificatesBlock data={data} theme={theme} />
      <InterestsBlock data={data} theme={theme} />
    </div>
  );
}
