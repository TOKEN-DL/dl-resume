import type { FontKey } from "./types";

/**
 * 字体族映射 — 预览端与 PDF 端共用同一套 key。
 *
 * 预览端用 webfont(浏览器按需加载),PDF 端用 react-pdf 的 family 名,
 * 由 src/lib/pdf/font.ts 注册。三处共用这个文件,避免两端字体跑偏。
 */
export const FONT_STACKS: Record<FontKey, { html: string; pdf: string }> = {
  sans: {
    html: '"Noto Sans SC", system-ui, -apple-system, "PingFang SC", sans-serif',
    pdf: "Noto Sans SC",
  },
  serif: {
    html: '"Noto Serif SC", "Songti SC", "SimSun", serif',
    pdf: "Noto Serif SC",
  },
  kai: {
    html: '"LXGW WenKai", "Kaiti SC", "STKaiti", serif',
    pdf: "LXGW WenKai",
  },
};

/** 字体 key → 展示名(画廊筛选器里用) */
export const FONT_LABELS: Record<FontKey, string> = {
  sans: "黑体",
  serif: "宋体",
  kai: "楷体",
};
