/**
 * 简历模板预览组件 — classic / modern / minimal.
 *
 * 渲染的是"看起来像 PDF"的 A4 等比缩放 HTML,
 * 字号和间距按 96 DPI 设计,预览容器用 transform: scale() 缩放.
 *
 * F3 only handles display. F16 PDF 导出复用同一渲染逻辑.
 */
"use client";

import type { ResumeData } from "@/lib/validation/resume";
import templateStyles from "./templates.module.css";

interface Props {
  data: ResumeData;
  /** 当前选中的模板 id */
  template: "classic" | "modern" | "minimal";
}

const TEMPLATE_META: Record<Props["template"], { label: string; font: string }> = {
  classic: { label: "经典", font: '"Noto Serif SC", "Fraunces", serif' },
  modern: { label: "现代", font: '"DM Sans", "Noto Sans SC", sans-serif' },
  minimal: { label: "极简", font: '"Noto Sans SC", "DM Sans", sans-serif' },
};

export function TemplatePreview({ data, template }: Props) {
  const meta = TEMPLATE_META[template];
  return (
    <div
      className={`${templateStyles.preview} ${templateStyles[`tpl_${template}`]}`}
      style={{ fontFamily: meta.font }}
    >
      <div className={templateStyles.sheet}>
        <Header data={data} />
        {data.summary && <Block title="个人简介"><RichHtml html={data.summary} /></Block>}
        {data.work.length > 0 && (
          <Block title="工作经历">
            {data.work.map((w) => (
              <PeriodItem
                key={w.id}
                title={w.company}
                subtitle={w.position}
                period={w.period}
              >
                <RichHtml html={w.description} />
              </PeriodItem>
            ))}
          </Block>
        )}
        {data.education.length > 0 && (
          <Block title="教育背景">
            {data.education.map((e) => (
              <PeriodItem
                key={e.id}
                title={e.school}
                subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`}
                period={e.period}
              >
                <RichHtml html={e.description} />
              </PeriodItem>
            ))}
          </Block>
        )}
        {data.projects.length > 0 && (
          <Block title="项目经历">
            {data.projects.map((p) => (
              <PeriodItem
                key={p.id}
                title={p.name}
                subtitle={`${p.role ?? ""}${p.url ? ` · ${p.url}` : ""}`}
                period={p.period}
              >
                <RichHtml html={p.description} />
              </PeriodItem>
            ))}
          </Block>
        )}
        {data.skills.length > 0 && (
          <Block title="专业技能">
            <ul className={templateStyles.skillList}>
              {data.skills.map((s) => (
                <li key={s.id} className={templateStyles.skillItem}>
                  <span className={templateStyles.skillName}>{s.name}</span>
                  <LevelDots level={s.level ?? "intermediate"} />
                </li>
              ))}
            </ul>
          </Block>
        )}
        {data.languages.length > 0 && (
          <Block title="语言能力">
            <ul className={templateStyles.skillList}>
              {data.languages.map((l) => (
                <li key={l.id} className={templateStyles.skillItem}>
                  <span className={templateStyles.skillName}>{l.name}</span>
                  <span className={templateStyles.langLevel}>{l.level || "—"}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
        {data.awards.length > 0 && (
          <Block title="荣誉奖项">
            {data.awards.map((a) => (
              <div key={a.id} className={templateStyles.simpleItem}>
                <div className={templateStyles.simpleHead}>
                  <span className={templateStyles.simpleTitle}>{a.title}</span>
                  <span className={templateStyles.simpleMeta}>
                    {a.awarder ? `${a.awarder} · ` : ""}{a.date}
                  </span>
                </div>
                {a.description && <RichHtml html={a.description} />}
              </div>
            ))}
          </Block>
        )}
        {data.certificates.length > 0 && (
          <Block title="证书">
            {data.certificates.map((c) => (
              <div key={c.id} className={templateStyles.simpleItem}>
                <div className={templateStyles.simpleHead}>
                  <span className={templateStyles.simpleTitle}>{c.name}</span>
                  <span className={templateStyles.simpleMeta}>
                    {c.issuer ? `${c.issuer} · ` : ""}{c.date}
                  </span>
                </div>
              </div>
            ))}
          </Block>
        )}
        {data.interests && (
          <Block title="兴趣爱好">
            <RichHtml html={escapeText(data.interests).replace(/\n/g, "<br/>")} />
          </Block>
        )}
      </div>
    </div>
  );
}

// ─── 内部小部件 ─────────────────────────────────────────────────────
function Header({ data }: { data: ResumeData }) {
  const b = data.basics;
  return (
    <header className={templateStyles.header}>
      <div className={templateStyles.headerMain}>
        {b.avatar && <img src={b.avatar} alt="" className={templateStyles.avatar} />}
        <div>
          <h1 className={templateStyles.name}>{b.name || "未填写姓名"}</h1>
          {b.label && <div className={templateStyles.label}>{b.label}</div>}
          <div className={templateStyles.contact}>
            {/* 与 PDF 保持一致:不用符号字形,避免字体缺字形导致显示不一致 */}
            {b.email && <span>邮箱 {b.email}</span>}
            {b.phone && <span>电话 {b.phone}</span>}
            {b.location && <span>所在地 {b.location}</span>}
            {b.gender && <span>· {b.gender === "male" ? "男" : b.gender === "female" ? "女" : "其他"}</span>}
          </div>
          {b.summary && <div className={templateStyles.oneLine}>{b.summary}</div>}
        </div>
      </div>
    </header>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={templateStyles.block}>
      <h2 className={templateStyles.blockTitle}>{title}</h2>
      <div className={templateStyles.blockBody}>{children}</div>
    </section>
  );
}

function PeriodItem({
  title,
  subtitle,
  period,
  children,
}: {
  title: string;
  subtitle?: string;
  period?: { start?: string; end?: string; current?: boolean };
  children?: React.ReactNode;
}) {
  const range = `${period?.start ?? ""}${period?.start || period?.end ? " — " : ""}${period?.current ? "至今" : period?.end ?? ""}`;
  return (
    <div className={templateStyles.periodItem}>
      <div className={templateStyles.periodHead}>
        <div>
          <span className={templateStyles.periodTitle}>{title}</span>
          {subtitle && <span className={templateStyles.periodSubtitle}> · {subtitle}</span>}
        </div>
        <span className={templateStyles.periodRange}>{range}</span>
      </div>
      {children && <div className={templateStyles.periodBody}>{children}</div>}
    </div>
  );
}

function LevelDots({ level }: { level: "beginner" | "intermediate" | "advanced" | "expert" }) {
  const target = ["beginner", "intermediate", "advanced", "expert"].indexOf(level);
  return (
    <span className={templateStyles.dots}>
      {[0, 1, 2, 3].map((n) => (
        <span key={n} className={n <= target ? `${templateStyles.dot} ${templateStyles.dotOn}` : templateStyles.dot} />
      ))}
    </span>
  );
}

function RichHtml({ html }: { html: string }) {
  if (!html) return null;
  // 极简清洗:去掉 script
  const safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  return <div className={templateStyles.rich} dangerouslySetInnerHTML={{ __html: safe }} />;
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}