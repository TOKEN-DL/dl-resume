/**
 * 改写协议 —— 模型只回「补丁」,不回整份简历。
 *
 * 之前让模型吐完整 ResumeData 有三个问题:
 *   1. 输出量大(整份简历 + 两万 reasoning token)→ 改写阶段经常超时
 *   2. 模型漏掉某个条目就等于把那条经历删了 —— 整份替换的风险太大
 *   3. 本地规则引擎做的结构性修复(排序、时间规范化)会被整份替换冲掉
 *
 * 改成:给模型一份「可改字段清单」(路径 + 名字 + 当前内容),
 * 模型只回 {"edits":[{"path":"work[0].description","after":"..."}]},
 * 补丁由我们在本地打到简历上 —— 前后对照也由我们自己算,永远准。
 */
import type { ResumeData } from "@/lib/validation/resume";
import type { Change } from "../types";
import { stripManualNumbering, visibleText } from "../rewriter";

/** 字段类型:html 的富文本正文 / text 的纯文本 */
export type FieldKind = "html" | "text";

export interface EditField {
  /** 协议里的路径,如 "work[0].description" */
  path: string;
  /** 简历里的字段路径,如 "work:w_xxx.description" —— 用来跟评价里的 finding 对上 */
  target: string;
  /** 给模型看的字段名 */
  label: string;
  kind: FieldKind;
  /** 当前内容 */
  current: string;
}

export interface Edit {
  path: string;
  after: string;
}

/**
 * 列出所有可以改的字段。
 *
 * 索引路径(work[0])而不是 id —— id 是一长串随机串,模型抄错一个字符
 * 这条改写就丢了。索引它抄不错,本地再换算回 id。
 */
export function editableFields(data: ResumeData): EditField[] {
  const fields: EditField[] = [
    {
      path: "summary",
      target: "summary",
      label: "自我评价",
      kind: "html",
      current: data.summary,
    },
    {
      path: "basics.label",
      target: "basics.label",
      label: "求职意向",
      kind: "text",
      current: data.basics.label,
    },
    {
      path: "basics.location",
      target: "basics.location",
      label: "所在地",
      kind: "text",
      current: data.basics.location,
    },
  ];

  data.work.forEach((w, i) => {
    const who = w.company.trim() || `第 ${i + 1} 段经历`;
    fields.push({
      path: `work[${i}].position`,
      target: `work:${w.id}.position`,
      label: `${who}的职位`,
      kind: "text",
      current: w.position,
    });
    fields.push({
      path: `work[${i}].description`,
      target: `work:${w.id}.description`,
      label: `${who}的工作内容`,
      kind: "html",
      current: w.description,
    });
  });

  data.projects.forEach((p, i) => {
    const who = p.name.trim() || `第 ${i + 1} 个项目`;
    fields.push({
      path: `projects[${i}].role`,
      target: `projects:${p.id}.role`,
      label: `${who}的角色`,
      kind: "text",
      current: p.role,
    });
    fields.push({
      path: `projects[${i}].description`,
      target: `projects:${p.id}.description`,
      label: `${who}的描述`,
      kind: "html",
      current: p.description,
    });
  });

  return fields;
}

/** 模型可能回纯文本(带换行),塞进 HTML 正文前先转一下 */
function toHtml(text: string): string {
  if (/<[a-z/]/i.test(text)) return text;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  // 用 <ul><li> 而不是 <p>:简历正文本来就是这个结构,
  // 顺带让「去掉手工编号」的规则继续生效
  return `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

/** 把值写进简历(路径形如 work[0].description) */
function setField(out: ResumeData, path: string, value: string): void {
  const m = path.match(/^(work|projects)\[(\d+)\]\.(\w+)$/);
  if (m) {
    const arr = m[1] === "work" ? out.work : out.projects;
    const item = arr[Number(m[2])];
    if (!item) return;
    (item as unknown as Record<string, unknown>)[m[3]] = value;
    return;
  }
  if (path === "summary") {
    out.summary = value;
    return;
  }
  if (path === "basics.label") {
    out.basics.label = value;
    return;
  }
  if (path === "basics.location") {
    out.basics.location = value;
    return;
  }
}

/**
 * 把模型给的补丁打到简历上。
 *
 * 返回改写后的简历与一组前后对照。
 * 路径对不上、内容为空、纯文本没实质变化的,一律忽略 ——
 * 模型偶尔会编一个不存在的路径,不能让整份简历跟着崩。
 */
export function applyEdits(
  data: ResumeData,
  edits: Edit[],
): { data: ResumeData; changes: Change[] } {
  const out = structuredClone(data);
  const byPath = new Map(editableFields(data).map((f) => [f.path, f]));
  const changes: Change[] = [];

  for (const e of edits) {
    if (!e || typeof e.path !== "string") continue;
    const field = byPath.get(e.path);
    if (!field) continue;
    const raw = typeof e.after === "string" ? e.after : "";
    if (!raw.trim()) continue;

    const value =
      field.kind === "html" ? stripManualNumbering(toHtml(raw)) : raw.trim();

    // 纯文本变了但没实质变化(只是空白/标点),不记进对照
    if (visibleText(field.current) === visibleText(value)) continue;

    setField(out, field.path, value);
    changes.push({
      target: field.target,
      label: field.label,
      before: visibleText(field.current),
      after: visibleText(value),
    });
  }

  return { data: out, changes };
}
