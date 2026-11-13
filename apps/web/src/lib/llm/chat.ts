/**
 * 共享模型客户端 —— 走 OpenAI 兼容接口(DeepSeek / MiniMax 都吃这套协议)。
 *
 * 简历优化、面试押题等模块**共用这一份**调用代码,不要各写一份:
 * 思考块剥离、JSON 抠取、端点切换、鉴权失败提示都容易写错,
 * 复制一份就意味着以后要修两遍(而且多半会漏掉一处)。
 *
 * 配置(全部可选,一个都不配就自动退回本地规则引擎):
 *   LLM_PROVIDER   后端选择:deepseek(默认) / minimax
 *   LLM_API_KEY    必填(没有就退回本地引擎)
 *   LLM_BASE_URL   默认取所选后端的端点
 *   LLM_MODEL      默认取所选后端的模型
 *   LLM_THINKING   仅 MiniMax 生效:adaptive / disabled(默认 disabled)
 *
 * 兼容旧变量:MINIMAX_API_KEY / MINIMAX_BASE_URL / MINIMAX_MODEL / MINIMAX_THINKING。
 * 只配了旧变量的老部署,会自动按 MiniMax 后端跑,行为跟升级前一致。
 *
 * 本模块只管「怎么把话送给模型、把模型的回答取回来」;
 * 提示词与业务结构留在各自的模块里。
 */

/* ─── 后端注册表 ─────────────────────────────────────────────────── */

export type LlmProviderId = "deepseek" | "minimax";

export interface LlmProviderSpec {
  id: LlmProviderId;
  /** 给用户看的中文名 */
  label: string;
  /** 默认端点(OpenAI 兼容) */
  baseUrl: string;
  /** 默认模型 */
  model: string;
  /**
   * 是否支持 `thinking: {type}` 请求参数。
   *
   * 只有 MiniMax 认这个参数;DeepSeek 用 `deepseek-reasoner` 的推理内容
   * 走**响应里的 reasoning_content 字段**,不需要请求参数。
   * 给不认的后端发不认的参数,运气好被忽略,运气不好直接 400。
   */
  supportsThinking: boolean;
}

const PROVIDERS: Record<LlmProviderId, LlmProviderSpec> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    supportsThinking: false,
  },
  minimax: {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M3",
    supportsThinking: true,
  },
};

/**
 * 超时给足余量。
 *
 * 实测:一份 9.5K 字符的简历,评价一次要 78 秒 —— 推理模型烧了 1.9 万个
 * reasoning token。90 秒的线太贴,大简历随时可能踩超时。
 * 优化是后台任务,慢一点可以接受,超时回退才是体验事故。
 */
const TIMEOUT_MS = 180_000;

/** MiniMax 中国版 / 全球版域名 —— 401 时用来给出可操作的提示 */
const CN_BASE_URL = "https://api.minimaxi.com";
const GLOBAL_BASE_URL = "https://api.minimax.io";

/* ─── 配置读取 ───────────────────────────────────────────────────── */

/** 读一个环境变量,空串当没配 */
function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * 当前后端。
 *
 * 判定顺序:
 *   1. LLM_PROVIDER 显式指定 —— 以它为准
 *   2. 只配了旧的 MINIMAX_* 变量 —— 按 MiniMax 跑(老部署零改动继续工作)
 *   3. 都没配 —— 默认 DeepSeek
 */
export function provider(): LlmProviderId {
  const explicit = env("LLM_PROVIDER").toLowerCase();
  if (explicit === "deepseek" || explicit === "minimax") {
    return explicit;
  }

  // 老部署:只有 MINIMAX_* 一套变量 —— 保持 MiniMax 后端,别悄悄换供应商
  const legacyOnly =
    !env("LLM_API_KEY") &&
    (env("MINIMAX_API_KEY") || env("MINIMAX_BASE_URL") || env("MINIMAX_MODEL"));
  if (legacyOnly) return "minimax";

  return "deepseek";
}

/** 当前后端的规格 */
export function providerSpec(): LlmProviderSpec {
  return PROVIDERS[provider()];
}

/** 当前后端的中文名 */
export function providerLabel(): string {
  return providerSpec().label;
}

/**
 * API key。
 *
 * 新变量优先,旧变量兜底 —— 两套都配时以 LLM_API_KEY 为准。
 */
export function apiKey(): string {
  return env("LLM_API_KEY") || env("MINIMAX_API_KEY");
}

/** 有没有配 key —— 没有就自动走本地规则引擎 */
export function hasApiKey(): boolean {
  return apiKey().length > 0;
}

/** 请求端点:环境变量优先,否则用后端默认 */
export function baseUrl(): string {
  const custom = env("LLM_BASE_URL") || env("MINIMAX_BASE_URL");
  const raw = custom || providerSpec().baseUrl;
  return raw.replace(/\/+$/, "");
}

/** 模型名:环境变量优先,否则用后端默认 */
export function model(): string {
  const custom = env("LLM_MODEL") || env("MINIMAX_MODEL");
  return custom || providerSpec().model;
}

/**
 * 思考模式(仅 MiniMax 有意义)。
 *
 * 实测同一条 9.5K 字符的简历:
 *   adaptive(默认)—— 88 秒,11617 个思考 token,18 条发现
 *   disabled      —— 17 秒,0 个思考 token,27 条发现
 *
 * 关掉思考又快 5 倍,发现还更多 —— 省下的预算用在了输出上。
 * 所以默认 disabled;确实需要深度推理的场景可以设 LLM_THINKING=adaptive。
 */
export type ThinkingMode = "adaptive" | "disabled";

export function thinkingMode(): ThinkingMode {
  const v = (env("LLM_THINKING") || env("MINIMAX_THINKING") || "disabled").toLowerCase();
  return v === "adaptive" ? "adaptive" : "disabled";
}

/* ─── 思考块与 JSON 抠取 ─────────────────────────────────────────── */

/**
 * 去掉推理模型的思考块。
 *
 * MiniMax-M3 这类推理模型会把 <think>…</think> 塞在正文前面,
 * 而且思考块里**也会出现花括号**(它经常在思考里预演输出格式)。
 * 于是「取第一个 { 到最后一个 }」会捞到思考块中间的片段,JSON.parse 必然失败。
 *
 * 实测一次真实调用:总输出 81173 字符,其中 19192 个 token 是思考内容。
 *
 * DeepSeek 不用这个标记(推理内容走 reasoning_content 字段),但留着也无害。
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
        if (esc) esc = true;
        else if (c === "\\") esc = false;
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

/* ─── 发起调用 ───────────────────────────────────────────────────── */

/**
 * 鉴权/额度类错误的中文提示。
 *
 * 各家报错的含义不一样,混着说会把人带沟里:
 *   - MiniMax 401:最常见是拿错域名(中国版/全球版 key 不互通)
 *   - DeepSeek 401:key 不对;402 是余额不足(它把欠费用 402 而不是 401)
 */
function authErrorMessage(status: number, body: string): string {
  const spec = providerSpec();
  const raw = body.slice(0, 160);

  if (spec.id === "minimax" && (status === 401 || status === 403)) {
    const other = baseUrl().startsWith(CN_BASE_URL) ? GLOBAL_BASE_URL : CN_BASE_URL;
    return (
      `MiniMax 鉴权失败(HTTP ${status})。` +
      `MiniMax 中国版与全球版的 Key 不互通 —— ` +
      `当前用的 ${baseUrl()},试试把它换成 ${other}/v1。` +
      `原始响应:${raw}`
    );
  }

  if (spec.id === "deepseek" && status === 402) {
    return (
      `DeepSeek 账户余额不足(HTTP 402)。` +
      `去平台充值后重试,或者把 LLM_PROVIDER 切回 minimax 用别的 key。` +
      `原始响应:${raw}`
    );
  }

  if (status === 401 || status === 403) {
    return (
      `${spec.label} 鉴权失败(HTTP ${status})。` +
      `检查 LLM_API_KEY 是否正确、是否已过期。` +
      `原始响应:${raw}`
    );
  }

  return `${spec.label} 调用失败(HTTP ${status}):${body.slice(0, 200)}`;
}

/**
 * 发一轮对话,拿回模型的正文。
 *
 * 只负责「发请求 + 取内容」,不解析业务结构 ——
 * 解析交给调用方用 extractJson 自己决定。
 */
export async function chat(system: string, user: string): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("LLM_API_KEY 未配置(旧变量 MINIMAX_API_KEY 也认)");

  const spec = providerSpec();

  // thinking 参数只发给认它的后端
  const body: Record<string, unknown> = {
    model: model(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
  };
  if (spec.supportsThinking) {
    body.thinking = { type: thinkingMode() };
  }

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      throw new Error(authErrorMessage(res.status, errBody));
    }
    throw new Error(`${spec.label} 调用失败(HTTP ${res.status}):${errBody.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; reasoning_content?: string | null };
    }>;
  };
  const message = json.choices?.[0]?.message;
  const content = message?.content?.trim();

  if (!content) {
    // DeepSeek 的推理模型把内容放在 reasoning_content 里,正文可能为空
    const reasoning = message?.reasoning_content?.trim();
    throw new Error(
      reasoning
        ? `${spec.label} 返回正文为空(只返回了推理内容 ${reasoning.length} 字)`
        : `${spec.label} 返回内容为空`,
    );
  }
  return content;
}
