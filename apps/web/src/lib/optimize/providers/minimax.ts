/**
 * MiniMax provider —— 走 OpenAI 兼容接口。
 *
 * 这里只放**业务层**:提示词与返回结构的拼装。
 * 「怎么发请求、怎么剥思考块、怎么抠 JSON」都在共享客户端
 * @/lib/llm/chat 里,面试押题等模块共用同一份,不要复制一份。
 *
 * 模型只用来做**内容级**的评价与改写;分数仍然由本地引擎按问题严重度算,
 * 保证「分数」和「用户看到的问题清单」永远自洽。
 */
import { MODULE_LABELS, MODULE_ORDER, scoreOf } from "../analyzer";
import { applyEdits, editableFields, type Edit } from "./edits";
import type { Change, Finding, ModuleKey, ModuleReview, Severity } from "../types";
import type { OptimizeProvider, RewriteInput, RewriteOutput, ReviewInput } from "./provider";
import { stripHeavyFields } from "./provider";
import { chat, extractJson, model } from "@/lib/llm/chat";

/* ─── 评价 ─────────────────────────────────────────────────────── */

export const REVIEW_SYSTEM = `你是一位资深中文简历顾问,负责逐个模块审阅求职者的简历。
规则:
1. 只指出**具体、可改**的问题,不要泛泛而谈「建议加强」这类空话。
2. 每条问题必须给出 title(一句话结论)、detail(为什么有问题)、suggestion(具体怎么改)。
3. 绝不编造用户没有提供的经历、公司、数字或成果。
4. severity 只能是 error / warn / info 之一。
5. target 指向出问题的字段路径,取值范围:
   basics.name / basics.email / basics.phone / basics.label / basics.location /
   summary / work / projects / skills / education / languages / awards / certificates / interests
6. 只输出 JSON,不要任何解释文字。`;

export const REVIEW_USER = (input: ReviewInput): string =>
  `请审阅下面这份简历,按模块给出评价。
模块列表: ${MODULE_ORDER.map((m) => `${m}(${MODULE_LABELS[m]})`).join("、")}

输出格式:
{"reviews":[{"module":"work","findings":[{"severity":"warn","title":"...","detail":"...","suggestion":"...","target":"work"}]}]}

简历 JSON:
${JSON.stringify(stripHeavyFields(input.data))}`;

function toFindings(raw: unknown, module: ModuleKey): Finding[] {
  if (!Array.isArray(raw)) return [];
  const out: Finding[] = [];
  raw.forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    const r = f as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (!title) return;
    const severity: Severity =
      r.severity === "error" || r.severity === "info" ? r.severity : "warn";
    const target = r.target ? String(r.target) : undefined;
    out.push({
      id: `llm:${module}:${target ?? title}:${i}`,
      module,
      severity,
      title,
      detail: String(r.detail ?? "").trim() || title,
      suggestion: String(r.suggestion ?? "").trim() || "按上面的建议修改这一处。",
      target,
    });
  });
  return out;
}

/* ─── 改写 ─────────────────────────────────────────────────────── */

const REWRITE_SYSTEM = `你是一位资深中文简历顾问,按给定的优化方案改写简历。
铁律:
1. **绝不编造**用户没有提供的公司、经历、项目、数字或成果。需要数字的地方保留原文,不要瞎填。
2. 保留所有原有条目,只做方案要求的改动,不要删条目、不要改时间、不要改公司名。
3. 文字用中文,风格具体、克制、以动词开头。
4. 只输出 JSON,不要任何解释文字。`;

/**
 * 改写提示词。
 *
 * 只发「可改字段清单」+「要执行的方案」,不发整份简历 JSON ——
 * 模型要回的是补丁,不是另一份简历。输出量小一个量级,超时风险跟着降。
 *
 * 方案只给 error / warn 两档:info 档多是「可以更professional」这类打磨,
 * 真要改的话模型自己看得见字段当前内容,不必逐条喂。
 */
const REWRITE_USER = (input: RewriteInput): string => {
  const fields = editableFields(input.data);
  const plan = input.plan
    .filter((p) => p.severity === "error" || p.severity === "warn")
    .slice(0, 20)
    .map((p) => ({
      module: p.module,
      severity: p.severity,
      title: p.title,
      action: p.action,
    }));

  return `下面是这份简历里可以改的字段,以及要执行的优化方案。请按方案改写对应字段。

【可改字段清单】
${fields
  .map(
    (f) =>
      `--- path: ${f.path}\n字段: ${f.label}(${f.kind === "html" ? "HTML 正文" : "纯文本"})\n当前内容: ${f.current || "(空)"}`,
  )
  .join("\n\n")}

【要执行的优化方案】
${JSON.stringify(plan, null, 0)}

【规则】
1. 只改真正需要改的字段;不需要改的字段不要出现在 edits 里。
2. after 写**改写后的完整内容**,不是片段、不是 diff、不是「同上」。
3. HTML 正文类字段(summary 与 *.description)保持 <ul><li> 结构;
   纯文本字段(position / role / label / location)只写纯文本,不要加任何标签。
4. 需要用户自己补数字的地方,保留原文并在方案里说明要补什么,不要瞎填数字。
5. 只输出 JSON。

输出格式:
{"edits":[{"path":"work[0].description","after":"<ul><li>…</li></ul>"}]}`;
};

/* ─── Provider ─────────────────────────────────────────────────── */

export const minimaxProvider: OptimizeProvider = {
  id: "minimax",
  label: `MiniMax(${model()})`,

  async review(input: ReviewInput): Promise<ModuleReview[]> {
    const text = await chat(REVIEW_SYSTEM, REVIEW_USER(input));
    const parsed = extractJson<{ reviews?: Array<{ module?: string; findings?: unknown[] }> }>(
      text,
    );
    if (!parsed || !Array.isArray(parsed.reviews)) {
      throw new Error("MiniMax 返回的评价不是合法 JSON");
    }

    const byModule = new Map<ModuleKey, Finding[]>();
    for (const r of parsed.reviews) {
      // 不能叫 `module` —— Next 的 lint 把它当保留名(module 是 CJS 的全局)
      const moduleKey = String(r.module ?? "") as ModuleKey;
      if (!MODULE_ORDER.includes(moduleKey)) continue;
      const list = byModule.get(moduleKey) ?? [];
      list.push(...toFindings(r.findings, moduleKey));
      byModule.set(moduleKey, list);
    }

    return MODULE_ORDER.map((moduleKey) => {
      const findings = byModule.get(moduleKey) ?? [];
      return {
        module: moduleKey,
        label: MODULE_LABELS[moduleKey],
        score: scoreOf(findings),
        grade: findings.length === 0 ? "good" : scoreOf(findings) >= 60 ? "fair" : "poor",
        findings,
      };
    });
  },

  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    const text = await chat(REWRITE_SYSTEM, REWRITE_USER(input));
    const parsed = extractJson<{ edits?: unknown }>(text);
    if (!parsed || !Array.isArray(parsed.edits)) {
      throw new Error("MiniMax 返回的改写结果不是合法 JSON");
    }

    // 模型只回补丁,我们在本地打到简历上:
    // 前后对照由我们自己算(准),没被改动的字段一个都不动(安全),
    // 本地规则引擎做的排序与时间规范化也保留着(不丢)。
    const edits: Edit[] = [];
    for (const e of parsed.edits) {
      if (!e || typeof e !== "object") continue;
      const r = e as Record<string, unknown>;
      const path = String(r.path ?? "").trim();
      if (!path) continue;
      edits.push({ path, after: String(r.after ?? "") });
    }

    const result = applyEdits(input.data, edits);
    return { optimized: result.data, changes: result.changes };
  },
};
