/**
 * 字体注册 — react-pdf 在 Node.js 渲染时按需子集化嵌入.
 * 只注册一次,后续 PDF 生成复用缓存.
 */
import path from "node:path";

let registered = false;
let Font: any = null;

const FONT_FAMILY = "Noto Sans SC";

export function getFontFamily(): string {
  return FONT_FAMILY;
}

export async function registerFontsOnce(): Promise<void> {
  if (registered) return;
  if (!Font) {
    // dynamic import — react-pdf 是 ESM-only,Next.js RSC bundler 会误处理顶层 import
    const mod = await import("@react-pdf/renderer");
    Font = mod.Font;
  }
  registered = true;
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansSC-Regular.otf");
  Font.register({
    family: FONT_FAMILY,
    src: fontPath,
    fontStyle: "normal",
    fontWeight: 400,
  });
  Font.register({
    family: FONT_FAMILY,
    src: fontPath,
    fontStyle: "italic",
    fontWeight: 400,
  });
  Font.register({
    family: FONT_FAMILY,
    src: fontPath,
    fontStyle: "normal",
    fontWeight: 700,
  });
  Font.register({
    family: FONT_FAMILY,
    src: fontPath,
    fontStyle: "italic",
    fontWeight: 700,
  });
}