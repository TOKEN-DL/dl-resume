/**
 * PDF Document — 3 套布局:classic / modern / minimal.
 * 视觉规范与 src/components/editor/templates.tsx 的 HTML 预览一致.
 *
 * 使用 react-pdf v3+ 风格,所有元素以 <View>/<Text> 表达,无浏览器 DOM.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ResumeData } from "@/lib/validation/resume";
import { getFontFamily } from "./font";

// A4 in pt: 595.28 x 841.89
const PAGE = {
  size: "A4" as const,
  paddingTop: 40,
  paddingBottom: 40,
  paddingLeft: 56,
  paddingRight: 56,
};

export type TemplateId = "classic" | "modern" | "minimal";

interface Props {
  data: ResumeData;
  template: TemplateId;
}

export function ResumeDocument({ data, template }: Props) {
  switch (template) {
    case "modern":
      return <ModernDoc data={data} />;
    case "minimal":
      return <MinimalDoc data={data} />;
    case "classic":
    default:
      return <ClassicDoc data={data} />;
  }
}

// ─── 共享原子 ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: getFontFamily(),
    fontSize: 10,
    lineHeight: 1.5,
    color: "#0f172a",
    paddingTop: PAGE.paddingTop,
    paddingBottom: PAGE.paddingBottom,
    paddingHorizontal: PAGE.paddingLeft,
  },
  headerName: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 2,
  },
  headerLabel: {
    fontSize: 10,
    color: "#4b5563",
    marginBottom: 4,
  },
  headerContact: {
    fontSize: 9,
    color: "#4b5563",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  headerContactItem: {
    marginRight: 12,
  },
  headerOneLine: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 4,
    fontStyle: "italic",
  },
  block: {
    marginBottom: 12,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d8de",
  },
  itemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  itemTitle: {
    fontWeight: 700,
  },
  itemSubtitle: {
    color: "#4b5563",
  },
  itemRange: {
    color: "#4b5563",
    fontSize: 9,
  },
  itemBody: {
    marginTop: 2,
  },
  rich: {
    fontSize: 9.5,
  },
  richLine: {
    marginBottom: 1,
  },
  richList: {
    marginLeft: 12,
    marginBottom: 2,
  },
  skillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  langLevel: {
    fontSize: 9,
    color: "#4b5563",
  },
  simpleMeta: {
    color: "#4b5563",
    fontSize: 9,
  },
});

// ─── Rich HTML → React-pdf View 列表 ──────────────────────────────
// 极简解析: 支持 <p>/<ul>/<ol>/<li>/<strong>/<em>/<br> + a.
// 不支持嵌套 block/自定义属性.任何不识别节点 → 文本内容降级.
function RichHtml({ html }: { html: string }) {
  const blocks = splitTopLevel(html);
  return (
    <View style={styles.rich}>
      {blocks.map((node, i) => renderNode(node, i))}
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

function renderNode(node: Node, key: number): React.ReactNode {
  switch (node.kind) {
    case "p":
      return (
        <View key={key} wrap={false}>
          <Text style={styles.richLine}>{node.children.map((c, i) => renderInline(c, i))}</Text>
        </View>
      );
    case "ul":
    case "ol":
      return (
        <View key={key}>
          {node.children.map((c, i) => (
            <View key={i} style={styles.richList}>
              <Text>
                {node.kind === "ul" ? "• " : `${i + 1}. `}
                {c.kind === "li" ? c.children.map((cc, j) => renderInline(cc, j)) : ""}
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

function renderInline(node: Node, key: number): React.ReactNode {
  switch (node.kind) {
    case "text":
      return <Text key={key}>{node.value}</Text>;
    case "strong":
      return <Text key={key} style={{ fontWeight: 700 }}>{node.children.map((c, i) => renderInline(c, i))}</Text>;
    case "em":
      return <Text key={key} style={{ fontStyle: "italic" }}>{node.children.map((c, i) => renderInline(c, i))}</Text>;
    case "br":
      return <Text key={key}>{"\n"}</Text>;
    default:
      return null;
  }
}

// ─── Shared header + blocks ────────────────────────────────────────
function Header({ data, variant }: { data: ResumeData; variant: "center" | "left" }) {
  const b = data.basics;
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: "#0f172a",
        paddingBottom: 10,
        marginBottom: 12,
        alignItems: variant === "center" ? "center" : "flex-start",
      }}
    >
      <Text style={styles.headerName}>{b.name || "未填写姓名"}</Text>
      {!!b.label && <Text style={styles.headerLabel}>{b.label}</Text>}
      <View style={styles.headerContact}>
        {/* 不用 emoji:Noto Sans SC 无这些字形,PDF 里会变成 .notdef 乱码 */}
        {b.email && <Text style={styles.headerContactItem}>邮箱 {b.email}</Text>}
        {b.phone && <Text style={styles.headerContactItem}>电话 {b.phone}</Text>}
        {b.location && <Text style={styles.headerContactItem}>所在地 {b.location}</Text>}
      </View>
      {!!b.summary && <Text style={styles.headerOneLine}>{b.summary}</Text>}
    </View>
  );
}

function Block({ title, children, variant }: { title: string; children: React.ReactNode; variant: "classic" | "modern" | "minimal" }) {
  const extra =
    variant === "modern"
      ? { borderBottomWidth: 0, borderLeftWidth: 2, borderLeftColor: "#1e40af", paddingLeft: 6, color: "#1e40af" }
      : variant === "minimal"
      ? { borderBottomWidth: 0, fontSize: 10, color: "#4b5563", fontWeight: 500 as 400 | 500 }
      : {};
  return (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, extra as any]}>{title}</Text>
      {children}
    </View>
  );
}

function PeriodItem({
  title,
  subtitle,
  period,
  html,
}: {
  title: string;
  subtitle?: string;
  period?: { start?: string; end?: string; current?: boolean };
  html?: string;
}) {
  const range = `${period?.start ?? ""}${period?.start || period?.end ? " — " : ""}${period?.current ? "至今" : period?.end ?? ""}`;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={styles.itemHead}>
        <Text>
          <Text style={styles.itemTitle}>{title}</Text>
          {subtitle ? <Text style={styles.itemSubtitle}> · {subtitle}</Text> : null}
        </Text>
        <Text style={styles.itemRange}>{range}</Text>
      </View>
      {html ? <View style={styles.itemBody}><RichHtml html={html} /></View> : null}
    </View>
  );
}

function SkillsBlock({ items, variant }: { items: ResumeData["skills"]; variant: "classic" | "modern" | "minimal" }) {
  return (
    <Block title="专业技能" variant={variant}>
      {items.map((s) => {
        const idx = ["beginner", "intermediate", "advanced", "expert"].indexOf(s.level ?? "intermediate");
        return (
          <View key={s.id} style={styles.skillRow}>
            <Text style={styles.itemTitle}>{s.name}</Text>
            <Text style={{ fontSize: 8 }}>
              {[0, 1, 2, 3].map((n) => (n <= idx ? "●" : "○")).join(" ")}
            </Text>
          </View>
        );
      })}
    </Block>
  );
}

// ─── Classic ──────────────────────────────────────────────────────
function ClassicDoc({ data }: { data: ResumeData }) {
  return (
    <Document title={data.basics.name || "简历"}>
      <Page size={PAGE.size} style={styles.page} wrap>
        <Header data={data} variant="center" />
        {!!data.summary && <Block title="个人简介" variant="classic"><RichHtml html={data.summary} /></Block>}
        {data.work.length > 0 && (
          <Block title="工作经历" variant="classic">
            {data.work.map((w) => (
              <PeriodItem key={w.id} title={w.company} subtitle={w.position} period={w.period} html={w.description} />
            ))}
          </Block>
        )}
        {data.education.length > 0 && (
          <Block title="教育背景" variant="classic">
            {data.education.map((e) => (
              <PeriodItem key={e.id} title={e.school} subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`} period={e.period} html={e.description} />
            ))}
          </Block>
        )}
        {data.projects.length > 0 && (
          <Block title="项目经历" variant="classic">
            {data.projects.map((p) => (
              <PeriodItem key={p.id} title={p.name} subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`} period={p.period} html={p.description} />
            ))}
          </Block>
        )}
        {data.skills.length > 0 && <SkillsBlock items={data.skills} variant="classic" />}
        {data.languages.length > 0 && (
          <Block title="语言能力" variant="classic">
            {data.languages.map((l) => (
              <View key={l.id} style={styles.skillRow}>
                <Text style={styles.itemTitle}>{l.name}</Text>
                <Text style={styles.langLevel}>{l.level || "—"}</Text>
              </View>
            ))}
          </Block>
        )}
        {data.awards.length > 0 && (
          <Block title="荣誉奖项" variant="classic">
            {data.awards.map((a) => (
              <View key={a.id} style={{ marginBottom: 4 }}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{a.title}</Text>
                  <Text style={styles.simpleMeta}>{a.awarder ? `${a.awarder} · ` : ""}{a.date}</Text>
                </View>
                {!!a.description && <RichHtml html={a.description} />}
              </View>
            ))}
          </Block>
        )}
        {data.certificates.length > 0 && (
          <Block title="证书" variant="classic">
            {data.certificates.map((c) => (
              <View key={c.id} style={styles.itemHead}>
                <Text style={styles.itemTitle}>{c.name}</Text>
                <Text style={styles.simpleMeta}>{c.issuer ? `${c.issuer} · ` : ""}{c.date}</Text>
              </View>
            ))}
          </Block>
        )}
        {!!data.interests && (
          <Block title="兴趣爱好" variant="classic">
            <Text>{data.interests}</Text>
          </Block>
        )}
      </Page>
    </Document>
  );
}

// ─── Modern (蓝调) ────────────────────────────────────────────────
function ModernDoc({ data }: { data: ResumeData }) {
  return (
    <Document title={data.basics.name || "简历"}>
      <Page size={PAGE.size} style={[styles.page, { color: "#0f172a" }]} wrap>
        <Header data={data} variant="left" />
        {!!data.summary && <Block title="个人简介" variant="modern"><RichHtml html={data.summary} /></Block>}
        {data.work.length > 0 && (
          <Block title="工作经历" variant="modern">
            {data.work.map((w) => (
              <PeriodItem key={w.id} title={w.company} subtitle={w.position} period={w.period} html={w.description} />
            ))}
          </Block>
        )}
        {data.education.length > 0 && (
          <Block title="教育背景" variant="modern">
            {data.education.map((e) => (
              <PeriodItem key={e.id} title={e.school} subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`} period={e.period} html={e.description} />
            ))}
          </Block>
        )}
        {data.projects.length > 0 && (
          <Block title="项目经历" variant="modern">
            {data.projects.map((p) => (
              <PeriodItem key={p.id} title={p.name} subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`} period={p.period} html={p.description} />
            ))}
          </Block>
        )}
        {data.skills.length > 0 && <SkillsBlock items={data.skills} variant="modern" />}
        {data.languages.length > 0 && (
          <Block title="语言能力" variant="modern">
            {data.languages.map((l) => (
              <View key={l.id} style={styles.skillRow}>
                <Text style={styles.itemTitle}>{l.name}</Text>
                <Text style={styles.langLevel}>{l.level || "—"}</Text>
              </View>
            ))}
          </Block>
        )}
        {data.awards.length > 0 && (
          <Block title="荣誉奖项" variant="modern">
            {data.awards.map((a) => (
              <View key={a.id} style={{ marginBottom: 4 }}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{a.title}</Text>
                  <Text style={styles.simpleMeta}>{a.awarder ? `${a.awarder} · ` : ""}{a.date}</Text>
                </View>
                {!!a.description && <RichHtml html={a.description} />}
              </View>
            ))}
          </Block>
        )}
        {data.certificates.length > 0 && (
          <Block title="证书" variant="modern">
            {data.certificates.map((c) => (
              <View key={c.id} style={styles.itemHead}>
                <Text style={styles.itemTitle}>{c.name}</Text>
                <Text style={styles.simpleMeta}>{c.issuer ? `${c.issuer} · ` : ""}{c.date}</Text>
              </View>
            ))}
          </Block>
        )}
        {!!data.interests && (
          <Block title="兴趣爱好" variant="modern">
            <Text>{data.interests}</Text>
          </Block>
        )}
      </Page>
    </Document>
  );
}

// ─── Minimal (极简) ────────────────────────────────────────────────
function MinimalDoc({ data }: { data: ResumeData }) {
  return (
    <Document title={data.basics.name || "简历"}>
      <Page size={PAGE.size} style={styles.page} wrap>
        <Header data={data} variant="left" />
        {!!data.summary && <Block title="SUMMARY" variant="minimal"><RichHtml html={data.summary} /></Block>}
        {data.work.length > 0 && (
          <Block title="EXPERIENCE" variant="minimal">
            {data.work.map((w) => (
              <PeriodItem key={w.id} title={w.company} subtitle={w.position} period={w.period} html={w.description} />
            ))}
          </Block>
        )}
        {data.education.length > 0 && (
          <Block title="EDUCATION" variant="minimal">
            {data.education.map((e) => (
              <PeriodItem key={e.id} title={e.school} subtitle={`${e.degree ?? ""}${e.major ? " · " + e.major : ""}`} period={e.period} html={e.description} />
            ))}
          </Block>
        )}
        {data.projects.length > 0 && (
          <Block title="PROJECTS" variant="minimal">
            {data.projects.map((p) => (
              <PeriodItem key={p.id} title={p.name} subtitle={`${p.role ?? ""}${p.url ? " · " + p.url : ""}`} period={p.period} html={p.description} />
            ))}
          </Block>
        )}
        {data.skills.length > 0 && <SkillsBlock items={data.skills} variant="minimal" />}
        {data.languages.length > 0 && (
          <Block title="LANGUAGES" variant="minimal">
            {data.languages.map((l) => (
              <View key={l.id} style={styles.skillRow}>
                <Text style={styles.itemTitle}>{l.name}</Text>
                <Text style={styles.langLevel}>{l.level || "—"}</Text>
              </View>
            ))}
          </Block>
        )}
        {data.awards.length > 0 && (
          <Block title="AWARDS" variant="minimal">
            {data.awards.map((a) => (
              <View key={a.id} style={{ marginBottom: 4 }}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{a.title}</Text>
                  <Text style={styles.simpleMeta}>{a.awarder ? `${a.awarder} · ` : ""}{a.date}</Text>
                </View>
                {!!a.description && <RichHtml html={a.description} />}
              </View>
            ))}
          </Block>
        )}
        {data.certificates.length > 0 && (
          <Block title="CERTIFICATES" variant="minimal">
            {data.certificates.map((c) => (
              <View key={c.id} style={styles.itemHead}>
                <Text style={styles.itemTitle}>{c.name}</Text>
                <Text style={styles.simpleMeta}>{c.issuer ? `${c.issuer} · ` : ""}{c.date}</Text>
              </View>
            ))}
          </Block>
        )}
        {!!data.interests && (
          <Block title="INTERESTS" variant="minimal">
            <Text>{data.interests}</Text>
          </Block>
        )}
      </Page>
    </Document>
  );
}