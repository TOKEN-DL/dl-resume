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
  | "serif" // 衬线大字
  | "bracket" // 【标题】方括号
  | "solid" // 墨色实心块
  | "outline"; // 描边框标题

/** 技能展示形态 */
export type SkillStyle = "dots" | "bars" | "tags" | "plain";

/** 头像形状 */
export type AvatarStyle = "circle" | "square" | "rounded" | "none" | "ring";

/** 姓名展示样式 */
export type NameStyle = "plain" | "underline" | "band" | "big" | "frame" | "bracket";

/**
 * 抬头形态 —— 姓名 + 联系方式的排布方式。
 *
 * 这是单栏骨架之间最主要的区分维度:同样的骨架,
 * inline / center / stack / boxed / band 能呈现出完全不同的气质。
 */
export type HeaderStyle =
  | "auto" // 由骨架决定(单栏经典居中,其余左对齐)—— 存量模板的默认
  | "inline" // 头像与姓名左右并列
  | "center" // 整体居中
  | "stack" // 头像在上、姓名在下,纵向堆叠
  | "boxed" // 抬头整体加描边框
  | "band"; // 抬头铺满主色带


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
  /** 抬头形态 */
  headerStyle: HeaderStyle;
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
