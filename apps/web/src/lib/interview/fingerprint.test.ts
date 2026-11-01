/**
 * 归一化与指纹。
 *
 * 这一层是判重引擎的地基:同一道题在不同批次里可能被写成
 * 「请介绍一下什么是 RAG?」「什么是 RAG」「（ 什么是 RAG ）」,
 * 肉眼一看是三道题,归一化之后必须收敛成一道。
 */
import { describe, it, expect } from "vitest";
import {
  normalize,
  fingerprint,
  similarity,
  FINGERPRINT_LENGTH,
  MAX_FILLER_STRIP_ROUNDS,
} from "./fingerprint";

describe("normalize —— 归一化", () => {
  it("全角字符转半角", () => {
    expect(normalize("ＡＢＣ")).toBe("abc");
    expect(normalize("（一）")).toBe("一");
    expect(normalize("１２３")).toBe("123");
  });

  it("转小写", () => {
    expect(normalize("RAG 召回策略")).toBe("rag召回策略");
    expect(normalize("React")).toBe("react");
  });

  it("去掉所有空白", () => {
    expect(normalize(" 什么是\tRAG\n召回策略 ")).toBe("什么是rag召回策略");
    expect(normalize("React　Concurrent")).toBe("reactconcurrent");
  });

  it("去掉中英文标点", () => {
    expect(normalize("什么是RAG？")).toBe("什么是rag");
    expect(normalize("什么是 RAG, 召回?")).toBe("什么是rag召回");
    expect(normalize("「RAG」召回（策略）")).toBe("rag召回策略");
    expect(normalize("RAG / 向量检索")).toBe("rag向量检索");
  });

  it("剥离开头的填充词", () => {
    expect(normalize("请介绍一下什么是RAG")).toBe("什么是rag");
    expect(normalize("介绍一下什么是RAG")).toBe("什么是rag");
    expect(normalize("请谈谈如何做缓存失效")).toBe("如何做缓存失效");
    expect(normalize("谈谈如何做缓存失效")).toBe("如何做缓存失效");
    expect(normalize("说说缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("请说说缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("简述缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("描述一下缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("请描述缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("说一下缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("聊聊缓存失效处理")).toBe("缓存失效处理");
    expect(normalize("请聊一下缓存失效处理")).toBe("缓存失效处理");
  });

  it("最多剥两轮填充词", () => {
    expect(MAX_FILLER_STRIP_ROUNDS).toBe(2);
    expect(normalize("请介绍一下请谈谈什么是RAG")).toBe("什么是rag");
    // 第三轮不再剥 —— 再多就会伤到题干本体
    expect(normalize("请介绍一下请谈谈请说说什么是RAG")).toBe("请说说什么是rag");
  });

  it("只剥开头的填充词,句子中间的保留", () => {
    expect(normalize("什么是RAG请介绍一下")).toBe("什么是rag请介绍一下");
  });

  it("退化输入不炸", () => {
    expect(normalize("")).toBe("");
    expect(normalize("？？？")).toBe("");
    expect(normalize("R")).toBe("r");
  });
});

describe("fingerprint —— 指纹", () => {
  it("同样的文本两次归一化得到同一个指纹", () => {
    expect(fingerprint("什么是 RAG？")).toBe(fingerprint(" 什么是 RAG？ "));
  });

  it("写法不同但归一化后相同的题,指纹相同", () => {
    expect(fingerprint("请介绍一下，什么是 RAG？")).toBe(fingerprint("什么是RAG"));
    expect(fingerprint("（什么是 RAG）")).toBe(fingerprint("什么是 RAG"));
  });

  it("不同文本不碰撞", () => {
    const texts = [
      "什么是 RAG",
      "什么是缓存失效",
      "如何设计多租户权限系统",
      "谈谈 React 并发特性",
      "什么是向量检索",
    ];
    const prints = texts.map(fingerprint);
    expect(new Set(prints).size).toBe(texts.length);
  });

  it("指纹长度固定", () => {
    expect(FINGERPRINT_LENGTH).toBe(16);
    expect(fingerprint("什么是RAG")).toHaveLength(FINGERPRINT_LENGTH);
    expect(fingerprint("什么是RAG")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("similarity —— 相似度", () => {
  it("完全相同是 1", () => {
    expect(similarity("什么是 RAG", "什么是 RAG")).toBe(1);
  });

  it("毫不相干是 0", () => {
    expect(
      similarity("如何处理线上服务的限流与熔断", "Kubernetes 中 Pod 探针失败会导致什么后果"),
    ).toBe(0);
  });

  it("换个说法仍然很高", () => {
    const sim = similarity(
      "如何保证缓存与数据库之间的数据一致性?",
      "如何保证缓存与数据库之间的数据一致性呢",
    );
    expect(sim).toBeGreaterThan(0.82);
    expect(sim).toBeLessThan(1);
  });

  it("退化输入不炸", () => {
    // 归一化后是空串 → 没有内容可比,相似度为 0
    expect(similarity("", "")).toBe(0);
    expect(similarity("？？？", "???")).toBe(0);
    // 单字符够不着 bigram,但完全相同仍是 1
    expect(similarity("R", "R")).toBe(1);
    expect(similarity("R", "S")).toBe(0);
  });
});
