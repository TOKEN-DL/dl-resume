/**
 * Markdown 简历解析。
 *
 * Markdown 原生就是结构化的(标题 / 列表 / 表格),先转 HTML 再走
 * htmlToText,和 Word / PDF 共用同一条文本管线。
 */
import { marked } from "marked";
import { htmlToText } from "./html-to-text";

/** GFM 表格分隔行:| --- | :---: | ---: | */
const TABLE_DELIMITER_RE = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/;
/** 含竖线的行,且不是分隔行 */
const TABLE_ROW_RE = /\|/;

/** 去掉 front matter(否则 "title: 张三" 会被当正文) */
function stripFrontMatter(src: string): string {
  return src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * 丢掉表格的表头行和分隔行。
 * 否则 `| 时间 | 公司 | 职位 |` 会被 splitEntries 当成一条工作经历,
 * 结果 company 变成"时间"—— 实测踩过的坑。
 */
function stripTableHeaders(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!TABLE_DELIMITER_RE.test(line)) {
      // 本行是表头、下一行是分隔行 → 整行丢掉
      const next = lines[i + 1] ?? "";
      const isHeader =
        TABLE_ROW_RE.test(line) &&
        line.trim().length > 0 &&
        TABLE_DELIMITER_RE.test(next) &&
        next.includes("|");
      if (!isHeader) out.push(line);
    }
  }
  return out.join("\n");
}

function prepare(source: string): string {
  return stripTableHeaders(stripFrontMatter(source));
}

export function markdownToHtml(source: string): string {
  return marked.parse(prepare(source), { async: false, gfm: true, breaks: true }) as string;
}

/** 把 Markdown 源码转成抽取器能吃的纯文本 */
export function markdownToText(source: string): string {
  return htmlToText(markdownToHtml(source));
}