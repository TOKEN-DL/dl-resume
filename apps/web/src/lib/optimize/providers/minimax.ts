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
import { MODULE_LABELS, MODULE_ORDER, scoreOf } from "../analyzer";
import { applyEdits, editableFields, type Edit } from "./edits";
import type { Change, Finding, ModuleKey, ModuleReview, Severity } from "../types";
import type { OptimizeProvider, RewriteInput, RewriteOutput, ReviewInput } from "./provider";
import { stripHeavyFields } from "./provider";

/**
 * 默认端点用**中国版** minimaxi.com。
 *
 * MiniMax 的中国版与全球版是两套独立服务,API Key **不互通**:
 * 中国版 key 打到 minimax.io 会返回 401「invalid api key (2049)」,
 * 看着像 key 坏了,其实是找错了域名。
 *
 * 用全球版 key 的话,把 MINIMAX_BASE_URL 设成
 * https://api.minimax.io/v1 即可(或者干脆给整个 env 变量)。
 */
const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M3";
/**
 * 超时给足余量。
 *
 * 实测:一份 9.5K 字符的简历,评价一次要 78 秒 —— 推理模型烧了 1.9 万个
 * reasoning token。90 秒的线太贴,大简历随时可能踩超时。
 * 优化是后台任务,慢一点可以接受,超时回退才是体验事故。
 */
const TIMEOUT_MS = 180_000;

/** 中国版 / 全球版域名 —— 401 时用来给出可操作的提示 */
const CN_BASE_URL = "https://api.minimaxi.com";
const GLOBAL_BASE_URL = "https://api.minimax.io";

/**
 * 思考模式。
 *
 * 实测同一条 9.5K 字符的简历:
 *   adaptive(默认)—— 88 秒,11617 个思考 token,18 条发现
 *   disabled      —— 17 秒,0 个思考 token,27 条发现
 *
 * 关掉思考又快 5 倍,发现还更多 —— 省下的预算用在了输出上。
 * 所以默认 disabled;确实需要深度推理的场景可以设 MINIMAX_THINKING=adaptive。
 */
type ThinkingMode = "adaptive" | "disabled";

function thinkingMode(): ThinkingMode {
  const v = (process.env.MINIMAX_THINKING ?? "disabled").trim().toLowerCase();
  return v === "adaptive" ? "adaptive" : "disabled";
}

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

/**
 * 去掉推理模型的思考块。
 *
 * MiniMax-M3 这类推理模型会把 <think>…</think> 塞在正文前面,
 * 而且思考块里**也会出现花括号**(它经常在思考里预演输出格式)。
 * 于是「取第一个 { 到最后一个 }」会捞到思考块中间的片段,JSON.parse 必然失败。
 *
 * 实测一次真实调用:总输出 81173 字符,其中 19192 个 token 是思考内容。
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // 思考块被截断时(输出超长)只有开标记没有闭标记
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/**
 * 扫描出所有配对完整的 `{...}` / `[...]` 片段。
 *
 * 比「indexOf('{') + lastIndexOf('}」」稳:
 *   - 配对扫描能跳过字符串里的花括号
 *   - 逐个返回候选,第一个是散文里的花括号也没关系,解析失败会试下一个
 */
function balancedChunks(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") {
      i++;
      continue;
    }
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === ch) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) {
      i++;
      continue;
    }
    out.push(text.slice(i, end + 1));
    i = end + 1;
  }
  return out;
}

/** 从模型输出里抠出 JSON —— 模型很爱加 ```json 围栏、思考块和解释性前后缀 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = stripThinking(text);

  const attempts: string[] = [];
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);
  attempts.push(cleaned);
  attempts.push(...balancedChunks(cleaned));

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
      thinking: { type: thinkingMode() },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 401 最常见的原因是「拿错域名的 key」,而不是 key 本身坏了。
    // 把两个版本怎么切讲清楚,省得对着 invalid api key 干瞪眼。
    if (res.status === 401 || res.status === 403) {
      const other = baseUrl().startsWith(CN_BASE_URL) ? GLOBAL_BASE_URL : CN_BASE_URL;
      throw new Error(
        `MiniMax 鉴权失败(HTTP ${res.status})。` +
          `MiniMax 中国版与全球版的 Key 不互通 —— ` +
          `当前用的 ${baseUrl()},试试把它换成 ${other}/v1。` +
          `原始响应:${body.slice(0, 160)}`,
      );
    }
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
