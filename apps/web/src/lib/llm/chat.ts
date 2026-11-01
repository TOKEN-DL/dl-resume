/**
 * 共享模型客户端 —— 走 MiniMax 的 OpenAI 兼容接口。
 *
 * 简历优化、面试押题等模块**共用这一份**调用代码,不要各写一份:
 * 思考块剥离、JSON 抠取、端点切换、鉴权失败提示都容易写错,
 * 复制一份就意味着以后要修两遍(而且多半会漏掉一处)。
 *
 * 端点与模型名都可用环境变量覆盖:
 *   MINIMAX_API_KEY    必填,没有就自动退回本地规则引擎
 *   MINIMAX_BASE_URL  默认 https://api.minimaxi.com/v1(中国版)
 *   MINIMAX_MODEL     默认 MiniMax-M3
 *   MINIMAX_THINKING  默认 disabled(关掉思考又快 5 倍,发现还更多)
 *
 * 本模块只管「怎么把话送给模型、把模型的回答取回来」;
 * 提示词与业务结构留在各自的模块里。
 */

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
export type ThinkingMode = "adaptive" | "disabled";

export function thinkingMode(): ThinkingMode {
  const v = (process.env.MINIMAX_THINKING ?? "disabled").trim().toLowerCase();
  return v === "adaptive" ? "adaptive" : "disabled";
}

export function minimaxApiKey(): string {
  return (process.env.MINIMAX_API_KEY ?? "").trim();
}

export function hasMiniMaxKey(): boolean {
  return minimaxApiKey().length > 0;
}

export function baseUrl(): string {
  return (process.env.MINIMAX_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function model(): string {
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

/**
 * 发一轮对话,拿回模型的正文。
 *
 * 只负责「发请求 + 取内容」,不解析业务结构 ——
 * 解析交给调用方用 extractJson 自己决定。
 */
export async function chat(system: string, user: string): Promise<string> {
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
