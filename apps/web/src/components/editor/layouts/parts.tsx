"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ResumeData } from "@/lib/validation/resume";
import type { LayoutKind, ThemeTokens } from "@/lib/templates/types";
import { FONT_STACKS } from "@/lib/templates/fonts";
import styles from "../templates.module.css";

/**
 * 模板共享部件 —— 所有布局骨架复用。
 *
 * 视觉参数一律来自 theme token(以 CSS 变量注入),
 * 部件本身只负责结构,不写死颜色与字号。
 */

/** 把主题 token 注入成 CSS 变量,HTML 端与 PDF 端共用同一份定义 */
export function toCssVars(theme: ThemeTokens): CSSProperties {
  return {
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--border": theme.border,
    "--paper": theme.paper,
    "--font": FONT_STACKS[theme.font].html,
    "--font-scale": String(theme.fontScale),
    "--line-height": String(theme.lineHeight),
    "--radius": `${theme.radius}px`,
  } as CSSProperties;
}

/** 富文本:极简清洗后直接渲染(与 PDF 端解析器保持同一套标签语义) */
export function RichHtml({ html }: { html: string }) {
  if (!html) return null;
  const safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  return <div className={styles.rich} dangerouslySetInnerHTML={{ __html: safe }} />;
}

/** 章节块 —— 标题形态由 theme.heading 决定的钩子类 */
export function SectionBlock({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ThemeTokens;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.block} ${styles[`hdg_${theme.heading}`]}`}>
      <h2 className={styles.blockTitle}>{title}</h2>
      <div className={styles.blockBody}>{children}</div>
    </section>
  );
}

/** 经历条目(工作 / 项目 / 教育) */
export function EntryItem({
  title,
  subtitle,
  period,
  children,
}: {
  title: string;
  subtitle?: string;
  period?: { start?: string; end?: string; current?: boolean };
  children?: ReactNode;
}) {
  const range = formatPeriod(period);
  return (
    <div className={styles.entry}>
      <div className={styles.entryHead}>
        <div className={styles.entryTitleWrap}>
          <span className={styles.entryTitle}>{title}</span>
          {subtitle && <span className={styles.entrySubtitle}> · {subtitle}</span>}
        </div>
        {range && <span className={styles.entryRange}>{range}</span>}
      </div>
      {children && <div className={styles.entryBody}>{children}</div>}
    </div>
  );
}

/** 奖项 / 证书这类「标题 + 附加信息」的简单条目 */
export function SimpleItem({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.simpleItem}>
      <div className={styles.simpleHead}>
        <span className={styles.simpleTitle}>{title}</span>
        {meta && <span className={styles.simpleMeta}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

/** 技能列表 —— 四种展示形态 */
export function SkillList({
  items,
  theme,
  columns = 2,
}: {
  items: ResumeData["skills"];
  theme: ThemeTokens;
  columns?: number;
}) {
  const cls = styles[`sk_${theme.skill}`];
  return (
    <ul className={`${styles.skillList} ${cls}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((s) => {
        const target = LEVELS.indexOf(s.level ?? "intermediate");
        return (
          <li key={s.id} className={styles.skillItem}>
            <span className={styles.skillName}>{s.name}</span>
            {theme.skill === "dots" && (
              <span className={styles.dots}>
                {[0, 1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={n <= target ? `${styles.dot} ${styles.dotOn}` : styles.dot}
                  />
                ))}
              </span>
            )}
            {theme.skill === "bars" && (
              <span className={styles.bars}>
                {[0, 1, 2, 3].map((n) => (
                  <span key={n} className={n <= target ? styles.barOn : styles.bar} />
                ))}
              </span>
            )}
            {theme.skill === "tags" && (
              <span className={styles.skillTag}>{levelLabel(s.level)}</span>
            )}
            {theme.skill === "plain" && (
              <span className={styles.skillLevel}>{levelLabel(s.level)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 姓名 / 联系方式抬头 */
export function HeaderBlock({
  data,
  theme,
  layout,
}: {
  data: ResumeData;
  theme: ThemeTokens;
  /** 骨架类型 —— 决定抬头是居中还是左对齐 */
  layout: LayoutKind;
}) {
  const b = data.basics;
  // 单栏经典骨架用居中大标题,其余骨架一律左对齐
  const centered = layout === "single-classic";
  const avatarCls = styles[`av_${theme.avatar}`];
  return (
    <header
      className={`${styles.header} ${styles[`nm_${theme.nameStyle}`]} ${centered ? styles.headerCenter : ""}`}
    >
      <div className={styles.headerMain}>
        {b.avatar && theme.avatar !== "none" && (
          <img src={b.avatar} alt="" className={`${styles.avatar} ${avatarCls}`} />
        )}
        <div className={styles.headerText}>
          <h1 className={styles.name}>{b.name || "未填写姓名"}</h1>
          {b.label && <div className={styles.label}>{b.label}</div>}
          {/* 与 PDF 保持一致:不用符号字形,避免字体缺字形导致显示不一致 */}
          <div className={styles.contact}>
            {b.email && <span>邮箱 {b.email}</span>}
            {b.phone && <span>电话 {b.phone}</span>}
            {b.location && <span>所在地 {b.location}</span>}
            {b.gender && (
              <span>
                · {b.gender === "male" ? "男" : b.gender === "female" ? "女" : "其他"}
              </span>
            )}
          </div>
          {b.summary && <div className={styles.oneLine}>{b.summary}</div>}
        </div>
      </div>
    </header>
  );
}

/** 联系方式列表(侧栏骨架用) */
export function ContactList({ data }: { data: ResumeData }) {
  const b = data.basics;
  const items = [
    b.email && { label: "邮箱", value: b.email },
    b.phone && { label: "电话", value: b.phone },
    b.location && { label: "所在地", value: b.location },
    b.gender && {
      label: "性别",
      value: b.gender === "male" ? "男" : b.gender === "female" ? "女" : "其他",
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (items.length === 0) return null;
  return (
    <ul className={styles.contactList}>
      {items.map((it) => (
        <li key={it.label} className={styles.contactItem}>
          <span className={styles.contactLabel}>{it.label}</span>
          <span className={styles.contactValue}>{it.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** 语言能力 */
export function LanguageList({ items }: { items: ResumeData["languages"] }) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.langList}>
      {items.map((l) => (
        <li key={l.id} className={styles.langItem}>
          <span className={styles.langName}>{l.name}</span>
          <span className={styles.langLevel}>{l.level || "—"}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── 工具 ───────────────────────────────────────────────────────────

export function formatPeriod(period?: {
  start?: string;
  end?: string;
  current?: boolean;
}): string {
  if (!period) return "";
  const start = period.start ?? "";
  const end = period.current ? "至今" : period.end ?? "";
  if (!start && !end) return "";
  return `${start}${start || end ? " — " : ""}${end}`;
}

function levelLabel(level?: string): string {
  switch (level) {
    case "beginner":
      return "入门";
    case "intermediate":
      return "熟练";
    case "advanced":
      return "精通";
    case "expert":
      return "专家";
    default:
      return "—";
  }
}
