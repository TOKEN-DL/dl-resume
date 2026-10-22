/**
 * 富文本解析 —— PDF 端极简 HTML → react-pdf 渲染。
 *
 * 支持 <p>/<ul>/<ol>/<li>/<strong>/<em>/<br> + 实体解码,
 * 不支持嵌套 block / 自定义属性,任何不识别节点 → 文本内容降级。
 *
 * 解析逻辑与旧 documents.tsx 完全一致(原样搬出),只是样式来源
 * 从模块级常量改成了主题 token。
 */
import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ThemeTokens } from "@/lib/templates/types";
import { buildThemeStyles, FALLBACK_THEME, italicStyle, type ThemeStyles } from "./theme-styles";

export function RichHtml({ html, theme }: { html: string; theme?: ThemeTokens }) {
  if (!html) return null;
  const t = theme ?? FALLBACK_THEME;
  const s = buildThemeStyles(t);
  const blocks = splitTopLevel(html);
  return (
    <View style={s.rich}>
      {blocks.map((node, i) => renderNode(node, i, s, t))}
    </View>
  );
}

type Node =
  | { kind: "p"; children: Node[] }
  | { kind: "ul"; children: Node[] }
  | { kind: "ol"; children: Node[] }
  | { kind: "li"; children: Node[] }
  | { kind: "strong"; children: Node[] }
  | { kind: "em"; children: Node[] }
  | { kind: "br" }
  | { kind: "text"; value: string };

function parseFrag(s: string): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "<") {
      const close = s.indexOf(">", i);
      if (close === -1) break;
      const tag = s.slice(i + 1, close).trim().toLowerCase();
      i = close + 1;
      if (tag === "br" || tag === "br/") { out.push({ kind: "br" }); continue; }
      if (tag === "b" || tag === "strong") {
        const end = findClose(s, i, "strong");
        if (end === -1) { out.push({ kind: "text", value: "strong>" }); continue; }
        out.push({ kind: "strong", children: parseFrag(s.slice(i, end)) });
        i = end + "</strong>".length;
        continue;
      }
      if (tag === "i" || tag === "em") {
        const end = findClose(s, i, "em");
        if (end === -1) continue;
        out.push({ kind: "em", children: parseFrag(s.slice(i, end)) });
        i = end + "</em>".length;
        continue;
      }
      if (tag === "script" || tag === "style") {
        const end = s.toLowerCase().indexOf(`</${tag}>`, i);
        i = end === -1 ? s.length : end + `</${tag}>`.length;
        continue;
      }
      // 未知标签 — 跳过起始
      continue;
    }
    // 文本节点到下一个 <
    const end = s.indexOf("<", i);
    const slice = s.slice(i, end === -1 ? s.length : end);
    if (slice) out.push({ kind: "text", value: decodeEntities(slice) });
    if (end === -1) break;
    i = end;
  }
  return out;
}

function findClose(s: string, start: number, tag: string): number {
  const openRe = new RegExp(`<${tag}\\b`, "i");
  const closeRe = new RegExp(`</${tag}>`, "i");
  let depth = 1;
  let i = start;
  while (i < s.length) {
    const openM = openRe.exec(s.slice(i));
    const closeM = closeRe.exec(s.slice(i));
    if (!closeM) break;
    if (openM && openM.index < closeM.index) {
      depth++;
      i += openM.index + openM[0].length;
    } else {
      depth--;
      if (depth === 0) return i + closeM.index;
      i += closeM.index + closeM[0].length;
    }
  }
  return -1;
}

function splitTopLevel(html: string): Node[] {
  // 简化为: 在 </p> / </ul> / </ol> / <br/> / <br> 切分顶层段落
  const parts: Node[] = [];
  const re = /<(p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>|<br\s*\/?>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) {
      const between = html.slice(last, m.index).trim();
      if (between) parts.push({ kind: "p", children: parseFrag(between) });
    }
    if (m[0].startsWith("<br")) {
      parts.push({ kind: "br" });
    } else {
      const tag = m[1].toLowerCase() as "p" | "ul" | "ol";
      const inner = m[2];
      if (tag === "p") {
        parts.push({ kind: "p", children: parseFrag(inner) });
      } else {
        // ul/ol: 每个 li 一行
        const items: Node[] = [];
        const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
        let lm: RegExpExecArray | null;
        while ((lm = liRe.exec(inner)) !== null) {
          items.push({ kind: "li", children: parseFrag(lm[1]) });
        }
        parts.push({ kind: tag, children: items });
      }
    }
    last = m.index + m[0].length;
  }
  if (last < html.length) {
    const tail = html.slice(last).trim();
    if (tail) parts.push({ kind: "p", children: parseFrag(tail) });
  }
  return parts.length === 0 && html.trim() ? [{ kind: "p", children: parseFrag(html) }] : parts;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function renderNode(node: Node, key: number, s: ThemeStyles, theme: ThemeTokens): ReactNode {
  switch (node.kind) {
    case "p":
      return (
        <View key={key} wrap={false}>
          <Text style={s.richLine}>{node.children.map((c, i) => renderInline(c, i, s, theme))}</Text>
        </View>
      );
    case "ul":
    case "ol":
      return (
        <View key={key}>
          {node.children.map((c, i) => (
            <View key={i} style={s.richList}>
              <Text style={s.richLine}>
                {node.kind === "ul" ? "• " : `${i + 1}. `}
                {c.kind === "li" ? c.children.map((cc, j) => renderInline(cc, j, s, theme)) : ""}
              </Text>
            </View>
          ))}
        </View>
      );
    case "br":
      return <View key={key}><Text>{"\n"}</Text></View>;
    default:
      return null;
  }
}

function renderInline(node: Node, key: number, s: ThemeStyles, theme: ThemeTokens): ReactNode {
  switch (node.kind) {
    case "text":
      return <Text key={key}>{node.value}</Text>;
    case "strong":
      return <Text key={key} style={{ fontWeight: 700 }}>{node.children.map((c, i) => renderInline(c, i, s, theme))}</Text>;
    case "em":
      return <Text key={key} style={italicStyle(theme)}>{node.children.map((c, i) => renderInline(c, i, s, theme))}</Text>;
    case "br":
      return <Text key={key}>{"\n"}</Text>;
    default:
      return null;
  }
}
