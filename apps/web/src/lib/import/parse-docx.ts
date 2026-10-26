/**
 * Word(.docx)解析。
 *
 * mammoth 只支持 Office Open XML(.docx),不支持 2003 年的二进制 .doc。
 * .doc 的情况在 parse-file.ts 里按魔数拦截,给出明确提示而不是静默失败。
 */
import mammoth from "mammoth";
import { htmlToText } from "./html-to-text";

export interface DocxParseResult {
  text: string;
  /** mammoth 的告警(比如图片丢失),用于 UI 提示但不阻断 */
  warnings: string[];
}

/** 解析 .docx 二进制 → 纯文本 */
export async function docxToText(buffer: ArrayBuffer): Promise<DocxParseResult> {
  // mammoth 的 Node 版只认 options.buffer,浏览器版只认 options.arrayBuffer。
  // 两个键一起给,同一份代码在浏览器和命令行验证脚本里都能跑。
  const result = await mammoth.convertToHtml({
    arrayBuffer: buffer,
    buffer,
  } as Parameters<typeof mammoth.convertToHtml>[0]);
  const warnings = (result.messages ?? [])
    .map((m) => m.message)
    .filter((m) => typeof m === "string");

  return { text: htmlToText(result.value), warnings };
}