/**
 * PDF 端主题样式 —— ThemeTokens → react-pdf StyleSheet。
 *
 * 与 HTML 端(`components/editor/templates.module.css`)一一对应:
 * 同一份 token 驱动两端的颜色 / 字号 / 圆角 / 标题形态,
 * 骨架代码只写结构,不写死颜色与字号。
 */
import { StyleSheet } from "@react-pdf/renderer";
import type { ThemeTokens } from "@/lib/templates/types";
import { getFontFamily } from "./font";

/* ─── 版面尺寸(pt)────────────────────────────────────────────────── */

/** A4 宽度 */
export const PAGE_WIDTH = 595.28;
/** 页面左右留白 */
export const PAGE_PADDING_X = 56;
/** 页面上下留白 */
export const PAGE_PADDING_Y = 40;
/** 正文可用宽度(页面宽度 - 左右留白) */
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING_X * 2; // 483.28
/** 侧栏骨架:侧栏栏宽(约 34%) */
export const SIDEBAR_WIDTH = 164;
/** 侧栏骨架:主栏栏宽 */
export const MAIN_WIDTH = CONTENT_WIDTH - SIDEBAR_WIDTH; // 319.28
/** 双栏骨架:单栏栏宽(50%) */
export const COLUMN_WIDTH = CONTENT_WIDTH / 2; // 241.64
/** 栏与栏之间的留白 */
export const COLUMN_GAP = 12;

/**
 * 兜底主题 —— 不接主题的调用点(如直接用 `<RichHtml html />`)使用。
 * 与注册表 BASE_THEME 保持一致。
 */
export const FALLBACK_THEME: ThemeTokens = {
  accent: "#1e40af",
  accentSoft: "#eef2ff",
  ink: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  paper: "#ffffff",
  font: "sans",
  fontScale: 1,
  lineHeight: 1.55,
  radius: 4,
  heading: "rule",
  skill: "dots",
  avatar: "none",
  nameStyle: "plain",
};

function createStyles(theme: ThemeTokens) {
  const fontFamily = getFontFamily(theme.font);
  const fs = theme.fontScale;
  const base = 10 * fs; // 正文字号
  const body = 9.5 * fs; // 富文字号
  const small = 9 * fs; // 次要信息字号
  const title = 12 * fs; // 章节标题字号

  return StyleSheet.create({
    /* ─── 页面 ─────────────────────────────────────────────────── */
    page: {
      fontFamily,
      fontSize: base,
      color: theme.ink,
      // 深色模板必须给 Page 铺底色,否则 PDF 是白底
      backgroundColor: theme.paper,
    },
    pageBody: {
      paddingTop: PAGE_PADDING_Y,
      paddingBottom: PAGE_PADDING_Y,
      paddingLeft: PAGE_PADDING_X,
      paddingRight: PAGE_PADDING_X,
    },

    /* ─── 抬头 ─────────────────────────────────────────────────── */
    header: {
      borderBottomWidth: 1.5,
      borderBottomColor: theme.ink,
      paddingBottom: 12,
      marginBottom: 16,
    },
    headerFlush: {
      borderBottomWidth: 0,
      paddingBottom: 0,
      marginBottom: 18,
    },
    headerMain: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerMainCenter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: {},
    headerTextCenter: {
      alignItems: "center",
    },
    avatar: {
      width: 56,
      height: 56,
      marginRight: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    avatarCircle: { borderRadius: 9999 },
    avatarSquare: { borderRadius: 0 },
    avatarRounded: { borderRadius: 6 },
    name: {
      fontSize: 22 * fs,
      fontWeight: 700,
    },
    nameUnderline: {
      borderBottomWidth: 2,
      borderBottomColor: theme.accent,
      paddingBottom: 2,
      alignSelf: "flex-start",
    },
    nameBand: {
      backgroundColor: theme.accent,
      color: "#ffffff",
      paddingTop: 3,
      paddingBottom: 3,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: theme.radius,
      alignSelf: "flex-start",
    },
    nameBig: {
      fontSize: 26 * fs,
    },
    label: {
      fontSize: base,
      color: theme.muted,
      marginTop: 3,
    },
    contact: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 4,
      fontSize: small,
      color: theme.muted,
    },
    contactCenter: {
      justifyContent: "center",
    },
    contactItem: {
      marginRight: 10,
    },
    oneLine: {
      marginTop: 4,
      fontSize: small,
      color: theme.muted,
    },

    /* ─── 章节块 ───────────────────────────────────────────────── */
    block: {
      marginBottom: 12,
    },
    blockTitle: {
      fontSize: title,
      fontWeight: 700,
      marginBottom: 6,
      color: theme.ink,
    },
    // 标题形态 —— 由 theme.heading 选择,与 HTML 端 .hdg_* 一一对应
    headingRule: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingBottom: 3,
    },
    headingBand: {
      backgroundColor: theme.accent,
      color: "#ffffff",
      paddingTop: 3,
      paddingBottom: 3,
      paddingLeft: 8,
      paddingRight: 8,
      borderRadius: theme.radius,
      alignSelf: "flex-start",
    },
    headingBar: {
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      paddingLeft: 6,
      color: theme.accent,
    },
    headingPlain: {
      fontSize: 10 * fs,
      color: theme.muted,
      fontWeight: 500,
    },
    headingUnderline: {
      borderBottomWidth: 1.5,
      borderBottomColor: theme.accent,
      paddingBottom: 2,
      alignSelf: "flex-start",
    },
    headingIndex: {
      color: theme.accent,
    },
    headingSerif: {
      fontFamily,
      fontSize: title + 1,
    },

    /* ─── 侧栏 ─────────────────────────────────────────────────── */
    sidePanel: {
      width: SIDEBAR_WIDTH,
      backgroundColor: theme.accentSoft,
      paddingLeft: 14,
      paddingRight: 14,
    },
    sideSection: {
      marginBottom: 14,
    },
    sideTitle: {
      fontSize: 11 * fs,
      fontWeight: 700,
      color: theme.accent,
      marginBottom: 6,
    },

    /* ─── 条目 ─────────────────────────────────────────────────── */
    item: {
      marginBottom: 6,
    },
    itemHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 1,
    },
    itemTitle: {
      fontWeight: 700,
    },
    itemSubtitle: {
      color: theme.muted,
    },
    itemRange: {
      color: theme.muted,
      fontSize: small,
    },
    itemBody: {
      marginTop: 2,
    },
    simpleItem: {
      marginBottom: 6,
    },
    simpleMeta: {
      color: theme.muted,
      fontSize: small,
    },

    /* ─── 技能 ─────────────────────────────────────────────────── */
    skillRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    skillColumn: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    skillTag: {
      color: theme.accent,
      backgroundColor: theme.accentSoft,
      borderRadius: theme.radius,
      paddingLeft: 5,
      paddingRight: 5,
      fontSize: small,
    },
    skillLevel: {
      color: theme.muted,
      fontSize: 8.5 * fs,
    },
    skillMarks: {
      fontSize: 8 * fs,
      color: theme.accent,
    },
    skillTagsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillTagItem: {
      marginRight: 4,
      marginBottom: 3,
    },

    /* ─── 语言 / 联系方式列表 ──────────────────────────────────── */
    langRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    langName: {
      fontWeight: 500,
    },
    langLevel: {
      color: theme.muted,
      fontSize: small,
    },
    contactListItem: {
      marginBottom: 5,
    },
    contactLabel: {
      color: theme.muted,
      fontSize: 8 * fs,
    },
    contactValue: {
      color: theme.ink,
      fontSize: small,
    },

    /* ─── 富文本 ───────────────────────────────────────────────── */
    rich: {
      fontSize: body,
      color: theme.ink,
      // react-pdf v4: 无单位 lineHeight 会被当成「字号倍数」,必须写 pt 单位才是绝对行高
      lineHeight: `${body * theme.lineHeight}pt`,
    },
    richLine: {
      marginBottom: 1,
    },
    richList: {
      marginLeft: 12,
      marginBottom: 2,
    },

    /* ─── 分栏 / 时间轴 / 卡片 ─────────────────────────────────── */
    columnRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    column: {
      width: COLUMN_WIDTH,
    },
    columnHead: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingBottom: 12,
      marginBottom: 16,
    },
    timelineRow: {
      flexDirection: "row",
    },
    timelineRail: {
      width: 14,
      alignItems: "center",
    },
    timelineNode: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.accent,
      marginTop: 4,
    },
    timelineLine: {
      width: 1.5,
      flexGrow: 1,
      backgroundColor: theme.border,
    },
    timelineBody: {
      flexGrow: 1,
      paddingBottom: 10,
    },
    cardGridRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    card: {
      width: COLUMN_WIDTH - COLUMN_GAP / 2,
      borderWidth: 1,
      borderColor: theme.border,
      borderTopWidth: 3,
      borderTopColor: theme.accent,
      borderRadius: theme.radius,
      padding: 10,
      marginBottom: 10,
      backgroundColor: theme.paper,
    },
    cardHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    cardTitle: {
      fontSize: 10.5 * fs,
      fontWeight: 700,
    },
    cardMeta: {
      color: theme.muted,
      fontSize: 8.5 * fs,
      marginLeft: 6,
    },
    cardRole: {
      marginTop: 2,
      fontSize: 9.5 * fs,
      color: theme.accent,
    },
    cardUrl: {
      marginTop: 2,
      fontSize: 8.5 * fs,
      color: theme.muted,
    },
    cardBody: {
      marginTop: 4,
    },

    /* ─── 通用 ─────────────────────────────────────────────────── */
    muted: { color: theme.muted },
    accent: { color: theme.accent },
    ink: { color: theme.ink },
  });
}

export type ThemeStyles = ReturnType<typeof createStyles>;

const cache = new WeakMap<ThemeTokens, ThemeStyles>();

/** 由主题 token 生成样式表(同一份 token 只建一次) */
export function buildThemeStyles(theme: ThemeTokens): ThemeStyles {
  const hit = cache.get(theme);
  if (hit) return hit;
  const styles = createStyles(theme);
  cache.set(theme, styles);
  return styles;
}

/**
 * 斜体样式 —— 楷体族只注册了 normal 字形(见 lib/pdf/font.ts),
 * 强行 italic 会让 react-pdf 解析字体失败,这里退化为弱化色。
 */
export function italicStyle(theme: ThemeTokens) {
  if (theme.font === "kai") {
    return { color: theme.muted, fontStyle: "normal" as const };
  }
  return { color: theme.ink, fontStyle: "italic" as const };
}
