/**
 * MiniMax provider —— 走 OpenAI 兼容接口。
 *
 * 端点与模型名都可用环境变量覆盖:
 *   MINIMAX_API_KEY   必填,没有就自动退回本地规则引擎
 *   MINIMAX_BASE_URL  默认 https://api.minimax.io/v1
 *   MINIMAX_MODEL     默认 MiniMax-M3
 *
 * 模型只用来做**内容级**的评价与改写;分数仍然由本地引擎按问题严重度算,
 * 保证「分数」和「用户看到的问题清单」永远自洽。
 */
import { repairResumeData } from "@/lib/validation/resume";
import { MODULE_LABELS, MODULE_ORDER, scoreOf } from "../analyzer";
import { visibleText } from "../rewriter";
import type { Change, Finding, ModuleKey, ModuleReview, Severity } from "../types";
import type { OptimizeProvider, RewriteInput, RewriteOutput, ReviewInput } from "./provider";
import { stripHeavyFields } from "./provider";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const TIMEOUT_MS = 90_000;

export function minimaxApiKey(): string {
  return (process.env.MINIMAX_API_KEY ?? "").trim();
}

export function hasMiniMaxKey(): boolean {
  return minimaxApiKey().length > 0;
}

function baseUrl(): string {
  return (process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function model(): string {
  return (process.env.MINIMAX_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

/** 从模型输出里抠出 JSON —— 模型很爱加 ```json 围栏和解释性前后缀 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;

  const attempts = [
    raw,
    (() => {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      return s >= 0 && e > s ? raw.slice(s, e + 1) : "";
    })(),
    (() => {
      const s = raw.indexOf("[");
      const e = raw.lastIndexOf("]");
      return s >= 0 && e > s ? raw.slice(s, e + 1) : "";
    })(),
  ];

  for (const a of attempts) {
    if (!a.trim()) continue;
    try {
      return JSON.parse(a) as T;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

async function chat(system: string, user: string): Promise<string> {
  const key = minimaxApiKey();
  if (!key) throw new Error("MINIMAX_API_KEY 未配置");

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MiniMax 调用失败(HTTP ${res.status}):${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax 返回内容为空");
  return content;
}

/* ─── 评价 ─────────────────────────────────────────────────────── */

const REVIEW_SYSTEM = `你是一位资深中文简历顾问,负责逐个模块审阅求职者的简历。
规则:
1. 只指出**具体、可改**的问题,不要泛泛而谈「建议加强」这类空话。
2. 每条问题必须给出 title(一句话结论)、detail(为什么有问题)、suggestion(具体怎么改)。
3. 绝不编造用户没有提供的经历、公司、数字或成果。
4. severity 只能是 error / warn / info 之一。
5. target 指向出问题的字段路径,取值范围:
   basics.name / basics.email / basics.phone / basics.label / basics.location /
   summary / work / projects / skills / education / languages / awards / certificates / interests
6. 只输出 JSON,不要任何解释文字。`;

const REVIEW_USER = (input: ReviewInput): string =>
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
3. 文字用中文,风格具体、克制、以动词开头,句子之间用换行分隔。
4. changes 里的 before 与 after 写成**纯文本**:去掉 HTML 标签,多条要点之间用 \\n 分行。
5. 只输出 JSON,不要任何解释文字。`;

const REWRITE_USER = (input: RewriteInput): string =>
  `原始简历与优化方案如下,请输出改写后的完整简历 JSON。

输出格式:
{"optimized":{...完整 ResumeData...},"changes":[{"target":"work:xxx.description","label":"工作经历描述","before":"...","after":"..."}]}

【优化方案】
${JSON.stringify(
    input.plan.map((p) => ({
      module: p.module,
      severity: p.severity,
      title: p.title,
      action: p.action,
    })),
    null,
    0,
  )}

【原始简历】
${JSON.stringify(stripHeavyFields(input.data), null, 0)}`;

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
    const parsed = extractJson<{ optimized?: unknown; changes?: unknown }>(text);
    if (!parsed || !parsed.optimized) {
      throw new Error("MiniMax 返回的改写结果不是合法 JSON");
    }

    // 模型返回的必须过一遍修复 —— 它可能漏字段或写错类型
    const optimized = repairResumeData(parsed.optimized);

    const changes: Change[] = [];
    if (Array.isArray(parsed.changes)) {
      for (const c of parsed.changes) {
        if (!c || typeof c !== "object") continue;
        const r = c as Record<string, unknown>;
        const target = String(r.target ?? "").trim();
        if (!target) continue;
        changes.push({
          target,
          label: String(r.label ?? target),
          // 模型多半会把原始 HTML 原样吐回来 —— 洗成纯文本,
          // 不然报告的对照里就是一串 <li> 标签
          before: visibleText(String(r.before ?? "")),
          after: visibleText(String(r.after ?? "")),
        });
      }
    }

    return { optimized, changes };
  },
};
