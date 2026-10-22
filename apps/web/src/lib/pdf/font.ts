/**
 * 字体注册 — react-pdf 在 Node.js 渲染时按需子集化嵌入.
 *
 * 三族:
 *   sans  → Noto Sans SC  (黑体,通用)
 *   serif → Noto Serif SC (宋体,正式/文艺)
 *   kai   → LXGW WenKai   (楷体,清新/手写感)
 *
 * 字体文件由 `npm run setup:fonts` 下载到 public/fonts/.
 * 缺失时抛出中文可读错误,而不是让 fontkit 抛英文底层异常.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import type * as Renderer from "@react-pdf/renderer";

export type PdfFontKey = "sans" | "serif" | "kai";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

const FAMILIES: Record<
  PdfFontKey,
  { family: string; files: Array<{ file: string; weight: 400 | 700 }> }
> = {
  sans: {
    family: "Noto Sans SC",
    files: [
      { file: "NotoSansSC-Regular.otf", weight: 400 },
      { file: "NotoSansSC-Bold.otf", weight: 700 },
    ],
  },
  serif: {
    family: "Noto Serif SC",
    files: [
      { file: "NotoSerifSC-Regular.otf", weight: 400 },
      { file: "NotoSerifSC-Bold.otf", weight: 700 },
    ],
  },
  kai: {
    // 霞鹜文楷没有独立 Bold 字重,700 复用 Regular 文件。
    // 若 react-pdf 不合成粗体,楷体模板的标题层级改用色带 + 字号表达。
    family: "LXGW WenKai",
    files: [{ file: "LXGWWenKai-Regular.ttf", weight: 700 }],
  },
};

const FAMILY_BY_KEY: Record<PdfFontKey, string> = {
  sans: FAMILIES.sans.family,
  serif: FAMILIES.serif.family,
  kai: FAMILIES.kai.family,
};

/** 取 PDF 端字体族名(与预览端 lib/templates/fonts.ts 用同一套 key) */
export function getFontFamily(key: PdfFontKey = "sans"): string {
  return FAMILY_BY_KEY[key];
}

/** 全部需要落盘的字体文件名 */
export function listFontFiles(): string[] {
  return Object.values(FAMILIES).flatMap((f) => f.files.map((x) => x.file));
}

let registered = false;

export async function registerFontsOnce(): Promise<void> {
  if (registered) return;

  const missing = listFontFiles().filter((f) => !existsSync(path.join(FONT_DIR, f)));
  if (missing.length > 0) {
    throw new Error(
      `字体资源缺失: ${missing.join("、")}。请先运行 npm run setup:fonts 下载字体。`,
    );
  }

  // dynamic import — react-pdf 是 ESM-only,Next.js RSC bundler 会误处理顶层 import
  const { Font } = await import("@react-pdf/renderer");

  for (const { family, files } of Object.values(FAMILIES)) {
    for (const { file, weight } of files) {
      const src = path.join(FONT_DIR, file);
      Font.register({ family, src, fontStyle: "normal", fontWeight: weight });
      if (weight === 400) {
        // 斜体复用常规文件;PDF 内不做真正的倾斜合成,仅保证不因缺字重报错
        Font.register({ family, src, fontStyle: "italic", fontWeight: 400 });
      }
    }
  }

  registered = true;
}
