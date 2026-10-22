/**
 * PDF 端共享部件 —— 7 个骨架骨架复用。
 *
 * 与 HTML 端(`components/editor/layouts/parts.tsx` + `sections.tsx`)一一对应:
 * 同样的部件、同样的章节顺序、同样的空数据短路规则。
 * 视觉参数一律来自主题 token,部件本身只负责结构。
 */
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ResumeData } from "@/lib/validation/resume";
import type { ThemeTokens } from "@/lib/templates/types";
import { buildThemeStyles, type ThemeStyles } from "../theme-styles";
import { RichHtml } from "../rich-html";

/* ─── 章节序号 ───────────────────────────────────────────────────── */

/** 章节 key —— 与 HTML 端 sections.tsx 的章节一一对应 */
export type SectionKey =
  | "summary"
  | "work"
  | "projects"
  | "education"
  | "skills"
  | "languages"
  | "awards"
  | "certificates"
  | "interests";

/** 章节是否有内容(空章节不渲染,也不占序号) */
export function isSectionVisible(data: ResumeData, key: SectionKey): boolean {
  switch (key) {
    case "summary":
      return !!data.summary;
    case "work":
      return data.work.length > 0;
    case "projects":
      return data.projects.length > 0;
    case "education":
      return data.education.length > 0;
    case "skills":
      return data.skills.length > 0;
    case "languages":
      return data.languages.length > 0;
    case "awards":
      return data.awards.length > 0;
    case "certificates":
      return data.certificates.length > 0;
    case "interests":
      return !!data.interests;
  }
}

/**
 * 章节序号 —— 等价于 HTML 端的 CSS counter(tplsec, decimal-leading-zero)。
 * 只给真正渲染出来的章节计数,顺序由调用方按 DOM 顺序给出。
 */
export function makeSectionIndexer(data: ResumeData, order: SectionKey[]) {
  const visible = order.filter((k) => isSectionVisible(data, k));
  const map = new Map(visible.map((k, i) => [k, String(i + 1).padStart(2, "0")]));
  return (key: SectionKey) => map.get(key) ?? "";
}

/* ─── 页面外壳 ───────────────────────────────────────────────────── */

/** 文档外壳 —— 所有骨架共用 */
export function PdfDocument({
  data,
  theme,
  children,
}: {
  data: ResumeData;
  theme: ThemeTokens;
  children: ReactNode;
}) {
  const s = buildThemeStyles(theme);
  return (
    <Document title={data.basics.name || "简历"}>
      <Page size="A4" style={[s.page, s.pageBody]} wrap>
        {children}
      </Page>
    </Document>
  );
}

/* ─── 抬头 ───────────────────────────────────────────────────────── */

/** 只有能真正加载的图片才渲染,避免坏 dataURL 让整份 PDF 崩掉 */
function isRenderableImage(src: string): boolean {
  return src.startsWith("data:image/") || src.startsWith("http://") || src.startsWith("https://");
}

function genderLabel(gender: string): string {
  return gender === "male" ? "男" : gender === "female" ? "女" : "其他";
}

/** 姓名 / 联系方式抬头 */
export function HeaderBlock({
  data,
  theme,
  centered = false,
  flush = false,
}: {
  data: ResumeData;
  theme: ThemeTokens;
  /** 单栏经典骨架:姓名居中 */
  centered?: boolean;
  /** 侧栏骨架:抬头不带下边框 */
  flush?: boolean;
}) {
  const s = buildThemeStyles(theme);
  const b = data.basics;

  // 抬头形态:theme.headerStyle 优先,"auto" 沿用骨架传入的默认(居中 / 不居中)
  const hs = theme.headerStyle;
  const isCentered = hs === "center" || (hs === "auto" && centered);
  const isBand = hs === "band";
  const isBoxed = hs === "boxed";
  const isStack = hs === "stack";

  const avatarShape =
    theme.avatar === "circle"
      ? s.avatarCircle
      : theme.avatar === "square"
        ? s.avatarSquare
        : theme.avatar === "ring"
          ? s.avatarRing
          : s.avatarRounded;
  const nameShape =
    theme.nameStyle === "underline"
      ? s.nameUnderline
      : theme.nameStyle === "band"
        ? s.nameBand
        : theme.nameStyle === "big"
          ? s.nameBig
          : theme.nameStyle === "frame"
            ? s.nameFrame
            : null;
  // 【姓名】—— 与 HTML 端 .nm_bracket 的伪元素保持一致
  const nameText =
    theme.nameStyle === "bracket"
      ? `【${b.name || "未填写姓名"}】`
      : b.name || "未填写姓名";

  const containerStyle = isBand
    ? s.headerBand
    : isBoxed
      ? s.headerBoxed
      : flush
        ? s.headerFlush
        : s.header;
  const mainStyle = isStack ? s.headerStack : isCentered ? s.headerMainCenter : s.headerMain;
  const textStyle = isStack ? s.headerStackText : isCentered ? s.headerTextCenter : s.headerText;

  return (
    <View style={containerStyle}>
      <View style={mainStyle}>
        {b.avatar && theme.avatar !== "none" && isRenderableImage(b.avatar) && (
          <Image src={b.avatar} style={[s.avatar, avatarShape]} />
        )}
        <View style={textStyle}>
          <Text style={[s.name, nameShape ?? undefined, isBand ? s.bandName : undefined]}>
            {nameText}
          </Text>
          {!!b.label && <Text style={[s.label, isBand ? s.bandLabel : undefined]}>{b.label}</Text>}
          {/* 与 HTML 端保持一致:不用符号字形,避免字体缺字形导致显示不一致 */}
          <View
            style={[
              s.contact,
              isCentered ? s.contactCenter : undefined,
              isBand ? s.bandContact : undefined,
            ]}
          >
            {b.email && <Text style={s.contactItem}>邮箱 {b.email}</Text>}
            {b.phone && <Text style={s.contactItem}>电话 {b.phone}</Text>}
            {b.location && <Text style={s.contactItem}>所在地 {b.location}</Text>}
            {b.gender && <Text style={s.contactItem}>· {genderLabel(b.gender)}</Text>}
          </View>
          {!!b.summary && (
            <Text style={[s.oneLine, isBand ? s.bandOneLine : undefined]}>{b.summary}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

/* ─── 章节块 ─────────────────────────────────────────────────────── */

/** 标题形态 —— 由 theme.heading 决定 */
function headingVariant(s: ThemeStyles, theme: ThemeTokens) {
  switch (theme.heading) {
    case "band":
      return s.headingBand;
    case "bar":
      return s.headingBar;
    case "plain":
      return s.headingPlain;
    case "underline":
      return s.headingUnderline;
    case "index":
      return s.headingIndex;
    case "serif":
      return s.headingSerif;
    case "bracket":
      return s.headingBracket;
    case "solid":
      return s.headingSolid;
    case "outline":
      return s.headingOutline;
    case "rule":
    default:
      return s.headingRule;
  }
}

/** 章节块 —— 标题形态由 theme.heading 决定 */
export function SectionBlock({
  title,
  theme,
  index,
  children,
}: {
  title: string;
  theme: ThemeTokens;
  /** 章节序号(仅 heading === "index" 时使用) */
  index?: string;
  children?: ReactNode;
}) {
  const s = buildThemeStyles(theme);
  const label = theme.heading === "index" && index ? `${index} ${title}` : title;
  // 【标题】—— 与 HTML 端 .hdg_bracket 的伪元素保持一致
  const shown = theme.heading === "bracket" ? `【${label}】` : label;
  return (
    <View style={s.block}>
      <Text style={[s.blockTitle, headingVariant(s, theme)]}>{shown}</Text>
      {children}
    </View>
  );
}

/* ─── 条目 ───────────────────────────────────────────────────────── */

/** 经历条目(工作 / 项目 / 教育) */
export function EntryItem({
  title,
  subtitle,
  period,
  theme,
  children,
}: {
  title: string;
  subtitle?: string;
  period?: { start?: string; end?: string; current?: boolean };
  theme: ThemeTokens;
  children?: ReactNode;
}) {
  const s = buildThemeStyles(theme);
  const range = formatPeriod(period);
  return (
    <View style={s.item}>
      <View style={s.itemHead}>
        <Text>
          <Text style={s.itemTitle}>{title}</Text>
          {subtitle ? <Text style={s.itemSubtitle}> · {subtitle}</Text> : null}
        </Text>
        {range ? <Text style={s.itemRange}>{range}</Text> : null}
      </View>
      {children ? <View style={s.itemBody}>{children}</View> : null}
    </View>
  );
}

/** 奖项 / 证书这类「标题 + 附加信息」的简单条目 */
export function SimpleItem({
  title,
  meta,
  theme,
  children,
}: {
  title: string;
  meta?: string;
  theme: ThemeTokens;
  children?: ReactNode;
}) {
  const s = buildThemeStyles(theme);
  return (
    <View style={s.simpleItem}>
      <View style={s.itemHead}>
        <Text style={s.itemTitle}>{title}</Text>
        {meta ? <Text style={s.simpleMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/* ─── 技能 / 语言 / 联系方式 ─────────────────────────────────────── */

const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

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

/** 单条技能 —— 四种展示形态由 theme.skill 决定 */
function SkillRow({ item, theme }: { item: ResumeData["skills"][number]; theme: ThemeTokens }) {
  const s = buildThemeStyles(theme);
  const target = LEVELS.indexOf(item.level ?? "intermediate");
  return (
    <View style={s.skillRow}>
      <Text style={s.itemTitle}>{item.name}</Text>
      {theme.skill === "dots" && (
        <Text style={s.skillMarks}>{[0, 1, 2, 3].map((n) => (n <= target ? "●" : "○")).join(" ")}</Text>
      )}
      {theme.skill === "bars" && (
        <Text style={s.skillMarks}>{[0, 1, 2, 3].map((n) => (n <= target ? "▇" : "▁")).join(" ")}</Text>
      )}
      {theme.skill === "plain" && <Text style={s.skillLevel}>{levelLabel(item.level)}</Text>}
    </View>
  );
}

/** 技能列表 —— 与 HTML 端 SkillList 同构 */
export function SkillList({
  items,
  theme,
  columns = 2,
  width,
}: {
  items: ResumeData["skills"];
  theme: ThemeTokens;
  columns?: number;
  /** 可用宽度(pt) */
  width: number;
}) {
  const s = buildThemeStyles(theme);
  if (items.length === 0) return null;

  // 标签形态:整块流式排布
  if (theme.skill === "tags") {
    return (
      <View style={s.skillTagsWrap}>
        {items.map((it) => (
          <View key={it.id} style={s.skillTagItem}>
            <Text style={s.skillTag}>[{it.name}]</Text>
          </View>
        ))}
      </View>
    );
  }

  const colWidth = (width - 12 * (columns - 1)) / columns;
  const rows: Array<ResumeData["skills"]> = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri} style={s.skillColumn}>
          {row.map((it) => (
            <View key={it.id} style={{ width: colWidth }}>
              <SkillRow item={it} theme={theme} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 语言能力 */
export function LanguageList({ items, theme }: { items: ResumeData["languages"]; theme: ThemeTokens }) {
  const s = buildThemeStyles(theme);
  if (items.length === 0) return null;
  return (
    <View>
      {items.map((l) => (
        <View key={l.id} style={s.langRow}>
          <Text style={s.langName}>{l.name}</Text>
          <Text style={s.langLevel}>{l.level || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

/** 联系方式列表(侧栏骨架用) */
export function ContactList({ data, theme }: { data: ResumeData; theme: ThemeTokens }) {
  const s = buildThemeStyles(theme);
  const b = data.basics;
  const items = [
    b.email && { label: "邮箱", value: b.email },
    b.phone && { label: "电话", value: b.phone },
    b.location && { label: "所在地", value: b.location },
    b.gender && { label: "性别", value: genderLabel(b.gender) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (items.length === 0) return null;
  return (
    <View>
      {items.map((it) => (
        <View key={it.label} style={s.contactListItem}>
          <Text style={s.contactLabel}>{it.label}</Text>
          <Text style={s.contactValue}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─── 时间轴 / 项目卡片 ─────────────────────────────────────────── */

/** 时间轴条目 */
export interface TimelineEntry {
  id: string;
  title: string;
  subtitle?: string;
  period?: { start?: string; end?: string; current?: boolean };
  html?: string;
}

/** 时间轴 —— 左侧轨道 + 节点圆点 */
export function TimelineList({
  entries,
  theme,
}: {
  entries: TimelineEntry[];
  theme: ThemeTokens;
}) {
  const s = buildThemeStyles(theme);
  return (
    <View>
      {entries.map((e) => (
        <View key={e.id} style={s.timelineRow}>
          <View style={s.timelineRail}>
            <View style={s.timelineNode} />
            <View style={s.timelineLine} />
          </View>
          <View style={s.timelineBody}>
            <EntryItem
              title={e.title}
              subtitle={e.subtitle}
              period={e.period}
              theme={theme}
            >
              {e.html ? <RichHtml html={e.html} theme={theme} /> : null}
            </EntryItem>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 项目卡片 */
export function ProjectCard({
  project,
  theme,
}: {
  project: ResumeData["projects"][number];
  theme: ThemeTokens;
}) {
  const s = buildThemeStyles(theme);
  const range = formatPeriod(project.period);
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{project.name}</Text>
        {range ? <Text style={s.cardMeta}>{range}</Text> : null}
      </View>
      {project.role ? <Text style={s.cardRole}>{project.role}</Text> : null}
      {project.url ? <Text style={s.cardUrl}>{project.url}</Text> : null}
      <View style={s.cardBody}>
        <RichHtml html={project.description} theme={theme} />
      </View>
    </View>
  );
}

/* ─── 章节(与 HTML 端 sections.tsx 一一对应)───────────────────────── */

export interface SectionProps {
  data: ResumeData;
  theme: ThemeTokens;
  /** 章节序号(仅 heading === "index" 时使用) */
  index?: string;
  /** 章节标题覆盖 */
  title?: string;
}

export function SummarySection({ data, theme, index }: SectionProps) {
  if (!data.summary) return null;
  return (
    <SectionBlock title="个人简介" theme={theme} index={index}>
      <RichHtml html={data.summary} theme={theme} />
    </SectionBlock>
  );
}

export function WorkSection({ data, theme, index, title = "工作经历" }: SectionProps) {
  if (data.work.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      {data.work.map((w) => (
        <EntryItem
          key={w.id}
          title={w.company}
          subtitle={w.position}
          period={w.period}
          theme={theme}
        >
          <RichHtml html={w.description} theme={theme} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function ProjectsSection({ data, theme, index, title = "项目经历" }: SectionProps) {
  if (data.projects.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      {data.projects.map((p) => (
        <EntryItem
          key={p.id}
          title={p.name}
          subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`}
          period={p.period}
          theme={theme}
        >
          <RichHtml html={p.description} theme={theme} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function EducationSection({ data, theme, index, title = "教育背景" }: SectionProps) {
  if (data.education.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      {data.education.map((e) => (
        <EntryItem
          key={e.id}
          title={e.school}
          subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`}
          period={e.period}
          theme={theme}
        >
          <RichHtml html={e.description} theme={theme} />
        </EntryItem>
      ))}
    </SectionBlock>
  );
}

export function SkillsSection({
  data,
  theme,
  index,
  title = "专业技能",
  columns = 2,
  width,
}: SectionProps & { columns?: number; width: number }) {
  if (data.skills.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      <SkillList items={data.skills} theme={theme} columns={columns} width={width} />
    </SectionBlock>
  );
}

export function LanguagesSection({ data, theme, index, title = "语言能力" }: SectionProps) {
  if (data.languages.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      <LanguageList items={data.languages} theme={theme} />
    </SectionBlock>
  );
}

export function AwardsSection({ data, theme, index, title = "荣誉奖项" }: SectionProps) {
  if (data.awards.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      {data.awards.map((a) => (
        <SimpleItem
          key={a.id}
          title={a.title}
          meta={`${a.awarder ? a.awarder + " · " : ""}${a.date}`}
          theme={theme}
        >
          {a.description ? <RichHtml html={a.description} theme={theme} /> : null}
        </SimpleItem>
      ))}
    </SectionBlock>
  );
}

export function CertificatesSection({ data, theme, index, title = "证书" }: SectionProps) {
  if (data.certificates.length === 0) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      {data.certificates.map((c) => (
        <SimpleItem
          key={c.id}
          title={c.name}
          meta={`${c.issuer ? c.issuer + " · " : ""}${c.date}`}
          theme={theme}
        />
      ))}
    </SectionBlock>
  );
}

export function InterestsSection({ data, theme, index, title = "兴趣爱好" }: SectionProps) {
  if (!data.interests) return null;
  return (
    <SectionBlock title={title} theme={theme} index={index}>
      <RichHtml
        html={escapeText(data.interests).replace(/\n/g, "<br/>")}
        theme={theme}
      />
    </SectionBlock>
  );
}

/* ─── 工具 ───────────────────────────────────────────────────────── */

/** 时间区间 —— 与 HTML 端 formatPeriod 一致 */
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

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}
