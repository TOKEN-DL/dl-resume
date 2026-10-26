/**
 * PDF 文本抽取(纯浏览器端)。
 *
 * 用 pdfjs-dist 在本地把 PDF 拆成带坐标的文字块,再按 y 聚行、按 x 补
 * 分隔符。为什么要补分隔符:简历里"时间 | 公司 | 职位"经常是左右排版,
 * pdfjs 返回的是一堆无结构片段,不做聚类的话下游完全认不出章节。
 *
 * 注意:这里不做 OCR。扫描件(纯图片 PDF)抽不出文字,会由上层转成
 * 明确的错误提示,而不是给用户一份空简历。
 */

/** worker 入口单独抽一个文件,见 pdf-worker.ts */
export interface PdfParseResult {
  text: string;
  pageCount: number;
}

interface RawItem {
  str: string;
  transform?: number[];
  width?: number;
}

/** 同一行的 y 坐标容差(1/72 英寸单位) */
const ROW_TOLERANCE = 3;
/** 两个文字块横向间隙超过这个值,认为是不同列 */
const COLUMN_GAP = 12;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((lib) => {
      try {
        lib.GlobalWorkerOptions.workerPort = new Worker(
          new URL("./pdf-worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        // 打包环境不支持 Worker 构造时,交给 pdfjs 的 fake worker,
        // 它会用动态 import 兜底(在浏览器里可用)。
      }
      return lib;
    });
  }
  return pdfjsPromise;
}

/** 把一页的 textContent 片段还原成带换行/制表符的行文本 */
export function itemsToLines(items: RawItem[]): string {
  const parsed = items
    .filter((it) => typeof it?.str === "string" && it.str.trim() !== "")
    .map((it) => ({
      str: it.str,
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
      w: it.width ?? 0,
    }));
  if (parsed.length === 0) return "";

  // 顶部优先,同一行从左往右
  parsed.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: string[] = [];
  let rowY = parsed[0].y;
  let current = "";
  let prevEndX: number | null = null;

  const flush = () => {
    const t = current.replace(/[\s\t]+$/, "");
    if (t) lines.push(t);
    current = "";
    prevEndX = null;
  };

  for (const it of parsed) {
    if (rowY - it.y > ROW_TOLERANCE) {
      flush();
      rowY = it.y;
    }
    if (prevEndX !== null) {
      const gap = it.x - prevEndX;
      if (gap > COLUMN_GAP) current += "\t";
      else if (gap > 1.2) current += " ";
    }
    current += it.str;
    prevEndX = it.x + it.w;
  }
  flush();

  return lines.join("\n");
}

/** 解析 PDF → 纯文本。整个过程不产生任何网络请求。 */
export async function pdfToText(buffer: ArrayBuffer): Promise<PdfParseResult> {
  const { getDocument } = await loadPdfjs();

  const doc = await getDocument({
    data: new Uint8Array(buffer),
    // 纯本地解析:关掉一切可能触发网络/字体下载的能力
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items as unknown as RawItem[]));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return { text: pages.join("\n\n").trim(), pageCount: doc.numPages };
}