/**
 * 共享模型客户端(llm/chat)的纯函数部分。
 *
 * 这里只测不依赖网络的逻辑:模型输出的 JSON 抠取、环境变量判定。
 * 真连模型要 key,不进单测。
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  apiKey,
  baseUrl,
  extractJson,
  hasApiKey,
  model,
  provider,
  providerLabel,
  stripThinking,
  thinkingMode,
} from "./chat";

/**
 * 临时改环境变量,测完还原。
 *
 * 这些函数读的是 process.env,单测必须把相关变量**全部**清干净 ——
 * 开发机上真的配了 key 的话,不清就会读到真 key,用例结果随机器变。
 */
const TOUCHED = [
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_THINKING",
  "MINIMAX_API_KEY",
  "MINIMAX_BASE_URL",
  "MINIMAX_MODEL",
  "MINIMAX_THINKING",
] as const;

const saved = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("extractJson", () => {
  it("直接吐 JSON 就能解析", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("带 ```json 围栏也能解析", () => {
    const text = '```json\n{"a":2}\n```';
    expect(extractJson<{ a: number }>(text)).toEqual({ a: 2 });
  });

  it("前后有解释文字也能抠出 JSON", () => {
    const text = '好的,这是结果:\n{"reviews":[]}\n希望有帮助。';
    expect(extractJson<{ reviews: unknown[] }>(text)).toEqual({ reviews: [] });
  });

  it("数组也能抠出来", () => {
    expect(extractJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("完全不是 JSON 时返回 null(而不是抛异常)", () => {
    expect(extractJson("我不知道")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  /**
   * 真实事故:推理模型(MiniMax-M3)会把 <think>…</think> 思考块放在正文前面,
   * 而思考块里也会出现花括号 —— 于是「第一个 { 到最后一个 }」会捞到
   * 思考块中间的片段,解析必挂,整条优化链路静默回退本地引擎。
   */
  it("思考块里带花括号时,仍能抠出末尾的 JSON", () => {
    const text = [
      "<think>",
      "We need output {reviews:[...]} exactly.",
      'Let me plan the schema: {"reviews": []}',
      "</think>",
      '{"reviews":[{"module":"work","findings":[]}]}',
    ].join("\n");
    expect(extractJson<{ reviews: unknown[] }>(text)).toEqual({
      reviews: [{ module: "work", findings: [] }],
    });
  });

  it("字符串里的花括号不会打乱配对", () => {
    const text = 'note {"a":"含 } 和 { 的字符串","b":2}';
    expect(extractJson<{ a: string; b: number }>(text)).toEqual({
      a: "含 } 和 { 的字符串",
      b: 2,
    });
  });

  it("散文里先出现的花括号不会吞掉真正的 JSON", () => {
    const text = '格式示例 {module} 如下:\n{"reviews":[]}';
    expect(extractJson<{ reviews: unknown[] }>(text)).toEqual({ reviews: [] });
  });
});

describe("stripThinking", () => {
  it("去掉完整的思考块", () => {
    expect(stripThinking("<think>abc</think>\nJSON")).toBe("JSON");
  });

  it("思考块被截断(只有开标记)时也清掉", () => {
    expect(stripThinking("<think>abc 没有结束")).toBe("");
  });

  it("没有思考块时原样返回", () => {
    expect(stripThinking('{"a":1}')).toBe('{"a":1}');
  });
});

describe("provider", () => {
  it("什么都没配时默认 DeepSeek", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    expect(provider()).toBe("deepseek");
    expect(providerLabel()).toBe("DeepSeek");
  });

  it("LLM_PROVIDER 可以切到 minimax", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "minimax");
    expect(provider()).toBe("minimax");
    expect(providerLabel()).toBe("MiniMax");
  });

  it("认不出的 LLM_PROVIDER 一律退回 deepseek", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "gpt-4o");
    expect(provider()).toBe("deepseek");
  });

  it("老部署只配了 MINIMAX_* 时按 MiniMax 跑(不悄悄换供应商)", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_API_KEY", "sk-legacy");
    expect(provider()).toBe("minimax");
  });

  it("新变量配了就按新变量走,不看旧的", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_API_KEY", "sk-legacy");
    setEnv("LLM_API_KEY", "sk-new");
    expect(provider()).toBe("deepseek");
  });

  it("LLM_PROVIDER 显式指定时优先级最高", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_API_KEY", "sk-legacy");
    setEnv("LLM_PROVIDER", "deepseek");
    expect(provider()).toBe("deepseek");
  });
});

describe("hasApiKey", () => {
  it("没有配 key 时返回 false(自动走本地引擎)", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    expect(hasApiKey()).toBe(false);
  });

  it("配了 key 时返回 true", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_API_KEY", "sk-test");
    expect(hasApiKey()).toBe(true);
  });

  it("旧的 MINIMAX_API_KEY 也认(向后兼容)", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_API_KEY", "sk-legacy");
    expect(hasApiKey()).toBe(true);
  });
});

describe("apiKey", () => {
  it("没配 key 时是空串", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    expect(apiKey()).toBe("");
  });

  it("配了 key 时去掉首尾空白", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_API_KEY", "  sk-test  ");
    expect(apiKey()).toBe("sk-test");
  });

  it("两套都配时以 LLM_API_KEY 为准", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_API_KEY", "sk-new");
    setEnv("MINIMAX_API_KEY", "sk-legacy");
    expect(apiKey()).toBe("sk-new");
  });
});

describe("baseUrl", () => {
  it("DeepSeek 默认指向官方端点", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "deepseek");
    expect(baseUrl()).toBe("https://api.deepseek.com/v1");
  });

  it("MiniMax 默认指向中国版端点", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "minimax");
    expect(baseUrl()).toBe("https://api.minimaxi.com/v1");
  });

  it("可以用环境变量切到全球版,末尾斜杠会被去掉", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "minimax");
    setEnv("LLM_BASE_URL", "https://api.minimax.io/v1/");
    expect(baseUrl()).toBe("https://api.minimax.io/v1");
  });

  it("旧的 MINIMAX_BASE_URL 也认", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_BASE_URL", "https://api.minimax.io/v1");
    expect(baseUrl()).toBe("https://api.minimax.io/v1");
  });
});

describe("model", () => {
  it("DeepSeek 默认用 deepseek-chat", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "deepseek");
    expect(model()).toBe("deepseek-chat");
  });

  it("MiniMax 默认用 MiniMax-M3", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "minimax");
    expect(model()).toBe("MiniMax-M3");
  });

  it("可以用环境变量覆盖,全是空白时退回默认", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_PROVIDER", "deepseek");
    setEnv("LLM_MODEL", "   ");
    expect(model()).toBe("deepseek-chat");
  });
});

describe("thinkingMode", () => {
  it("默认关掉思考(又快 5 倍,发现还更多)", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    expect(thinkingMode()).toBe("disabled");
  });

  it("LLM_THINKING=adaptive 时开启思考", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_THINKING", "adaptive");
    expect(thinkingMode()).toBe("adaptive");
  });

  it("认不出的值一律退回 disabled", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("LLM_THINKING", "on");
    expect(thinkingMode()).toBe("disabled");
  });

  it("旧的 MINIMAX_THINKING 也认", () => {
    for (const n of TOUCHED) setEnv(n, undefined);
    setEnv("MINIMAX_THINKING", "adaptive");
    expect(thinkingMode()).toBe("adaptive");
  });
});
