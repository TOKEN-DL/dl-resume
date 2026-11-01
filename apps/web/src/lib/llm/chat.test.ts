/**
 * 共享模型客户端(llm/chat)的纯函数部分。
 *
 * 这里只测不依赖网络的逻辑:模型输出的 JSON 抠取、环境变量判定。
 * 真连模型要 key,不进单测。
 */
import { describe, it, expect } from "vitest";
import {
  baseUrl,
  extractJson,
  hasMiniMaxKey,
  minimaxApiKey,
  model,
  stripThinking,
  thinkingMode,
} from "./chat";

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

describe("hasMiniMaxKey", () => {
  it("没有配 key 时返回 false(自动走本地引擎)", () => {
    const saved = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    expect(hasMiniMaxKey()).toBe(false);
    if (saved !== undefined) process.env.MINIMAX_API_KEY = saved;
  });

  it("配了 key 时返回 true", () => {
    const saved = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "sk-test";
    expect(hasMiniMaxKey()).toBe(true);
    if (saved === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = saved;
  });
});

describe("minimaxApiKey", () => {
  it("没配 key 时是空串", () => {
    const saved = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    expect(minimaxApiKey()).toBe("");
    if (saved !== undefined) process.env.MINIMAX_API_KEY = saved;
  });

  it("配了 key 时去掉首尾空白", () => {
    const saved = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "  sk-test  ";
    expect(minimaxApiKey()).toBe("sk-test");
    if (saved === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = saved;
  });
});

describe("baseUrl", () => {
  it("默认指向中国版端点", () => {
    const saved = process.env.MINIMAX_BASE_URL;
    delete process.env.MINIMAX_BASE_URL;
    expect(baseUrl()).toBe("https://api.minimaxi.com/v1");
    if (saved !== undefined) process.env.MINIMAX_BASE_URL = saved;
  });

  it("可以用环境变量切到全球版,末尾斜杠会被去掉", () => {
    const saved = process.env.MINIMAX_BASE_URL;
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1/";
    expect(baseUrl()).toBe("https://api.minimax.io/v1");
    if (saved === undefined) delete process.env.MINIMAX_BASE_URL;
    else process.env.MINIMAX_BASE_URL = saved;
  });
});

describe("model", () => {
  it("默认用 MiniMax-M3", () => {
    const saved = process.env.MINIMAX_MODEL;
    delete process.env.MINIMAX_MODEL;
    expect(model()).toBe("MiniMax-M3");
    if (saved !== undefined) process.env.MINIMAX_MODEL = saved;
  });

  it("可以用环境变量覆盖,全是空白时退回默认", () => {
    const saved = process.env.MINIMAX_MODEL;
    process.env.MINIMAX_MODEL = "   ";
    expect(model()).toBe("MiniMax-M3");
    if (saved === undefined) delete process.env.MINIMAX_MODEL;
    else process.env.MINIMAX_MODEL = saved;
  });
});

describe("thinkingMode", () => {
  it("默认关掉思考(又快 5 倍,发现还更多)", () => {
    const saved = process.env.MINIMAX_THINKING;
    delete process.env.MINIMAX_THINKING;
    expect(thinkingMode()).toBe("disabled");
    if (saved !== undefined) process.env.MINIMAX_THINKING = saved;
  });

  it("MINIMAX_THINKING=adaptive 时开启思考", () => {
    const saved = process.env.MINIMAX_THINKING;
    process.env.MINIMAX_THINKING = "adaptive";
    expect(thinkingMode()).toBe("adaptive");
    if (saved === undefined) delete process.env.MINIMAX_THINKING;
    else process.env.MINIMAX_THINKING = saved;
  });

  it("认不出的值一律退回 disabled", () => {
    const saved = process.env.MINIMAX_THINKING;
    process.env.MINIMAX_THINKING = "on";
    expect(thinkingMode()).toBe("disabled");
    if (saved === undefined) delete process.env.MINIMAX_THINKING;
    else process.env.MINIMAX_THINKING = saved;
  });
});
