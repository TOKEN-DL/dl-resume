"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { formatPeriod, HeaderBlock, RichHtml, SectionBlock } from "./parts";
import {
  AwardsBlock,
  CertificatesBlock,
  EducationBlock,
  InterestsBlock,
  LanguagesBlock,
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
 * 项目卡片流 —— 项目经历以两列卡片呈现,适合作品集类岗位。
 * designer / magazine 使用此骨架。
 */
export function CardGrid({ data, theme }: LayoutProps) {
  return (
    <div className={`${styles.sheet} ${styles.cardSheet}`}>
      <HeaderBlock data={data} theme={theme} layout="card-grid" />
      <SummaryBlock data={data} theme={theme} />
      <WorkBlock data={data} theme={theme} />

      {data.projects.length > 0 && (
        <SectionBlock title="项目经历" theme={theme}>
          <div className={styles.cardGrid}>
            {data.projects.map((p) => {
              const range = formatPeriod(p.period);
              return (
                <article key={p.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>{p.name}</h3>
                    {range && <span className={styles.cardMeta}>{range}</span>}
                  </div>
                  {p.role && <div className={styles.cardRole}>{p.role}</div>}
                  {p.url && <div className={styles.cardUrl}>{p.url}</div>}
                  <div className={styles.cardBody}>
                    <RichHtml html={p.description} />
                  </div>
                </article>
              );
            })}
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
