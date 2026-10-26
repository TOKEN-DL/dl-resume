/**
 * HTML → 纯文本。
 *
 * Word(mammoth)和 Markdown(marked)都先产出 HTML,再统一转成文本喂给
 * resumeFromText()。关键是要保住"行"和"字段分隔"两个结构信号:
 *  · 块级标签 → 换行(章节标题靠这个识别)
 *  · <td> / <th> → Tab(简历里"时间 | 公司 | 职位"经常是表格排版)
 *  · <li> → "- " 前缀(splitEntries 会剥掉)
 */

/** 块级标签,出现即视为换行 */
const BLOCK_TAGS = [
  "address", "article", "aside", "blockquote", "body", "caption", "dd",
  "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "html", "legend",
  "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", middot: "·",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", bull: "•", times: "×",
  copy: "©", reg: "®", trade: "™", deg: "°",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/** 把 HTML 变成保留换行与制表符的纯文本 */
export function htmlToText(html: string): string {
  let out = html;

  // 1. 丢掉脚本/样式/注释 —— 里面的字符会污染抽取
  out = out
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  // 2. 单元格之间用 Tab 分隔 —— 表格排版的中文简历靠它还原字段
  out = out
    .replace(/<\s*(td|th)\b[^>]*>/gi, "\t")
    .replace(/<\s*\/\s*(td|th)\s*>/gi, "")
    .replace(/<\s*(tr)\b[^>]*>/gi, "\n")
    .replace(/<\s*\/\s*(tr)\s*>/gi, "\n");

  // 3. 显式换行
  out = out.replace(/<\s*br\s*\/?\s*>/gi, "\n");

  // 4. 列表项加 "- " 前缀
  out = out
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n");

  // 5. 其余块级标签一律换行
  const block = BLOCK_TAGS.join("|");
  out = out
    .replace(new RegExp(`<\\s*(?:${block})\\b[^>]*>`, "gi"), "\n")
    .replace(new RegExp(`<\\s*\\/\\s*(?:${block})\\s*>`, "gi"), "\n");

  // 6. 剩下的都是行内标签,直接去掉
  out = out.replace(/<[^>]+>/g, "");

  // 7. 实体反转义
  out = decodeEntities(out);

  // 8. 规整空白。章节切分靠行,多空行没有额外信息,统一压成单换行。
  out = out
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\t{2,}/g, "\t")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return out;
}