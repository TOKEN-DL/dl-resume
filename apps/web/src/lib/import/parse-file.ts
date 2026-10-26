/**
 * 文件 → 纯文本的统一入口。
 *
 * 设计约束(F20 的核心卖点):**所有解析都在浏览器里跑,文件内容不会
 * 发往服务器**。所以这里只有 File/ArrayBuffer 进出,没有任何 fetch。
 *
 * 各格式的解析器按需动态加载 —— 用户只导入 Markdown 时不会白白下载
 * pdfjs 和 mammoth 的代码。
 */
import { htmlToText } from "./html-to-text";
import { markdownToText } from "./parse-markdown";

export type ResumeFormat = "pdf" | "docx" | "markdown" | "txt";

export type ImportErrorCode =
  | "unsupported-type"
  | "legacy-doc"
  | "scanned-pdf"
  | "empty-text"
  | "too-large"
  | "parse-failed";

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  /** 给用户看的一句话解决办法 */
  readonly hint: string;

  constructor(code: ImportErrorCode, message: string, hint: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.hint = hint;
  }
}

/** 20MB 足够放带图的简历 PDF,再大就该让用户拆分了 */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** file input 的 accept 属性 */
export const ACCEPT_ATTR = ".pdf,.docx,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

export const FORMAT_LABEL: Record<ResumeFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  markdown: "Markdown",
  txt: "纯文本",
};

/**
 * 扫描件判定:每页能抽到的有效字符太少就是图片型 PDF。
 * 阈值 24 字/页 —— 正常简历哪怕是纯表格也不至于这么少。
 */
export function looksLikeScannedText(text: string, pageCount: number): boolean {
  const chars = text.replace(/\s+/g, "").length;
  if (chars === 0) return true;
  if (chars < 24) return true;
  return chars / Math.max(1, pageCount) < 24;
}

/** OLE2 复合文档头 —— .doc(2003) 和部分加密 Office 文件都是这个 */
function isOle2(head: Uint8Array): boolean {
  return (
    head.length >= 8 &&
    head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0 &&
    head[4] === 0xa1 && head[5] === 0xb1 && head[6] === 0x1a && head[7] === 0xe1
  );
}

/** 按扩展名 + MIME 判断格式;.doc 单独返回以便给出针对性提示 */
export function detectFormat(name: string, mime: string): ResumeFormat | "doc" | null {
  const ext = (name.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "").toLowerCase();
  const type = (mime || "").toLowerCase();

  if (ext === "doc") return "doc";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "docx" || type.includes("wordprocessingml")) return "docx";
  if (ext === "md" || ext === "markdown" || type === "text/markdown") return "markdown";
  if (ext === "txt" || type.startsWith("text/")) return "txt";
  return null;
}

export interface ParsedResumeFile {
  text: string;
  format: ResumeFormat;
  meta: {
    bytes: number;
    charCount: number;
    pageCount?: number;
    warnings: string[];
  };
}

function decode(buffer: ArrayBuffer): string {
  // UTF-8 优先,失败再退回 GBK —— 国内用户存的 txt 简历常见 GBK
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return utf8;
  } catch {
    try {
      return new TextDecoder("gbk").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

async function readAsText(file: File, buffer: ArrayBuffer): Promise<string> {
  if (typeof file.text === "function") return await file.text();
  return decode(buffer);
}

/**
 * 解析用户选择的简历文件。
 * 成功返回纯文本;失败一律抛 ImportError,带可展示的 code + hint。
 */
export async function parseResumeFile(file: File): Promise<ParsedResumeFile> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError(
      "too-large",
      `文件 ${(file.size / 1024 / 1024).toFixed(1)}MB,超过 20MB 上限`,
      "请压缩图片后再试,或只保留简历正文页面",
    );
  }

  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 8));

  // 魔数优先:改过扩展名的 .doc / 加密 Office 都能拦下
  if (isOle2(head)) {
    throw new ImportError(
      "legacy-doc",
      "这是 2003 版 Word(.doc)文件",
      "请在 Word 里另存为 .docx,或直接导出成 PDF 后再导入",
    );
  }

  const format = detectFormat(file.name, file.type);
  if (!format || format === "doc") {
    if (format === "doc") {
      throw new ImportError(
        "legacy-doc",
        "暂不支持 .doc 旧格式",
        "请在 Word 里另存为 .docx,或直接导出成 PDF 后再导入",
      );
    }
    throw new ImportError(
      "unsupported-type",
      `暂不支持 ${file.name} 这种格式`,
      "目前支持 PDF、Word(.docx)、Markdown(.md) 和纯文本(.txt)",
    );
  }

  const warnings: string[] = [];
  let text = "";
  let pageCount: number | undefined;

  try {
    if (format === "pdf") {
      const { pdfToText } = await import("./parse-pdf");
      const r = await pdfToText(buffer);
      text = r.text;
      pageCount = r.pageCount;

      if (looksLikeScannedText(text, r.pageCount)) {
        throw new ImportError(
          "scanned-pdf",
          "这份 PDF 里没有可提取的文字,应该是扫描件或纯图片排版",
          "扫描件需要 OCR 才能识别。建议:用 Word 打开原简历另存为 .docx,或重新导出一份文字版 PDF",
        );
      }
    } else if (format === "docx") {
      const { docxToText } = await import("./parse-docx");
      const r = await docxToText(buffer);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (format === "markdown") {
      text = markdownToText(await readAsText(file, buffer));
    } else {
      text = await readAsText(file, buffer);
    }
  } catch (err) {
    // ImportError 是我们自己抛的业务错误,直接上抛
    if (err instanceof ImportError) throw err;
    throw new ImportError(
      "parse-failed",
      `解析 ${FORMAT_LABEL[format]} 文件失败`,
      "文件可能已损坏或被加密。可以先用 Word / 浏览器把文件另存为 PDF 或 Markdown 再试",
    );
  }

  if (!text.trim()) {
    throw new ImportError(
      "empty-text",
      "没能从文件里读出任何文字",
      "确认文件内容不是空白的,并检查是否用了图片排版",
    );
  }

  return {
    text,
    format,
    meta: { bytes: file.size, charCount: text.length, pageCount, warnings },
  };
}

export { htmlToText };