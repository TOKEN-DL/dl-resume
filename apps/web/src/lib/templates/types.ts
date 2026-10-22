import type { ResumeData } from "@/lib/validation/resume";

/**
 * 模板类型定义。
 *
 * 一套模板 = 一个布局骨架(LayoutKind) + 一份主题 token(ThemeTokens)
 * + 一份专属装饰层 + 一份范文。
 *
 * 主题 token 是纯数据:HTML 端注入成 CSS 变量,PDF 端喂给 StyleSheet.create,
 * 同一份定义驱动两端,结构上杜绝预览 / PDF 的视觉漂移。
 */

export type FontKey = "sans" | "serif" | "kai";

export type LayoutKind =
  | "single-classic"
  | "single-modern"
  | "sidebar-left"
  | "sidebar-right"
  | "two-column"
  | "timeline"
  | "card-grid";

export type StyleGroup =
  | "minimal"
  | "business"
  | "modern"
  | "fresh"
  | "elegant"
  | "creative"
  | "functional"
  | "academic";

export type SceneTag = "general" | "campus" | "social" | "intern" | "student";

export type RoleTag =
  | "frontend"
  | "backend"
  | "product"
  | "operation"
  | "design"
  | "algorithm"
  | "data"
  | "qa"
  | "research"
  | "finance";

/** 章节标题形态 */
export type HeadingStyle =
  | "rule" // 细线分隔
  | "band" // 色块底
  | "bar" // 左侧竖条
  | "plain" // 无框弱化
  | "underline" // 标题下划线
  | "index" // 序号式
  | "serif"; // 衬线大字

/** 技能展示形态 */
export type SkillStyle = "dots" | "bars" | "tags" | "plain";

/** 头像形状 */
export type AvatarStyle = "circle" | "square" | "rounded" | "none";

/** 姓名展示样式 */
export type NameStyle = "plain" | "underline" | "band" | "big";

export interface ThemeTokens {
  /** 主色 */
  accent: string;
  /** 主色淡化填充 */
  accentSoft: string;
  /** 正文色 */
  ink: string;
  /** 次要信息色 */
  muted: string;
  /** 描边色 */
  border: string;
  /** 页面底色 */
  paper: string;
  /** 字体族 */
  font: FontKey;
  /** 整体字号倍率 */
  fontScale: number;
  /** 行高 */
  lineHeight: number;
  /** 圆角 */
  radius: number;
  heading: HeadingStyle;
  skill: SkillStyle;
  avatar: AvatarStyle;
  nameStyle: NameStyle;
}

export interface TemplateDef {
  id: string;
  /** 中文模板名 */
  name: string;
  /** 风格主轴 */
  group: StyleGroup;
  /** 布局骨架 */
  layout: LayoutKind;
  theme: ThemeTokens;
  /** 场景标签 */
  scenes: SceneTag[];
  /** 岗位标签 */
  roles: RoleTag[];
  /** 一句话描述 */
  summary: string;
  /** 自带范文 */
  sample: ResumeData;
  /** 存量模板标记(classic / modern / minimal) */
  legacy?: boolean;
}
