/**
 * 三层判重引擎。
 *
 * 判重是这个功能风险最高的一块 —— 判重了用户白白丢题,
 * 判漏了题库里就堆满同一道题的换皮版本。
 * 这里把三层规则和套级比例都钉死,后面接数据库、接模型都不用再动判定逻辑。
 */
import { describe, it, expect } from "vitest";
import {
  checkDuplicate,
  checkSetDuplicate,
  SIMILARITY_THRESHOLD,
  SET_DUPLICATE_RATIO,
  type DedupCandidate,
  type DedupRule,
} from "./dedupe";

/** 一道题参与判重需要的最小信息:题干 + 考点 */
function q(question: string, topic: string): DedupCandidate {
  return { question, topic };
}

/**
 * 既有题库 —— 12 道彼此不同的题,覆盖不同考点。
 * 后面的套级判定直接拿它当「既有套」。
 */
const EXISTING: DedupCandidate[] = [
  q("请介绍一下你在项目中负责的 RAG 检索模块是怎么做召回优化的", "RAG召回优化"),
  q("谈谈向量检索和关键词检索的取舍", "检索策略"),
  q("如何设计一个支持多租户的权限系统", "多租户权限"),
  q("说说数据库索引失效的常见原因", "索引优化"),
  q("介绍一下你是如何排查线上接口变慢的问题", "性能排查"),
  q("谈谈 React 并发特性带来的心智负担", "React并发"),
  q("如何保证消息在分布式系统中不被重复消费", "消息幂等"),
  q("介绍一下你做过的数据迁移方案", "数据迁移"),
  q("谈谈缓存穿透击穿雪崩的治理手段", "缓存治理"),
  q("如何设计一个支持灰度发布的方案", "灰度发布"),
  q("说说 gRPC 与 HTTP 在内部通信选型上的区别", "微服务通信"),
  q("如何评估一次技术重构的成本与收益", "技术重构"),
];

/** 与既有题库重复的题 —— 覆盖 R1(原文相同)、R2(近似)、R3(同考点换皮) */
const DUPLICATES: DedupCandidate[] = [
  q("请介绍一下你在项目中负责的 RAG 检索模块是如何做召回优化的", "RAG召回优化"),
  q("谈谈向量检索和关键词检索的取舍", "检索策略"),
  q("如何设计一个支持多租户隔离的权限系统", "多租户权限"),
  q("说说数据库索引失效的常见原因", "索引优化"),
  q("介绍一下你是如何排查线上接口变慢的问题", "性能排查"),
  q("谈谈 React 并发特性带来的心智成本", "React并发"),
  q("如何保证消息在分布式系统中不被重复消费", "消息幂等"),
];

/** 全新题 —— 与既有题库没有任何交集 */
const FRESH: DedupCandidate[] = [
  q("Kubernetes 中 Pod 探针失败会导致什么后果", "容器编排"),
  q("前端首屏体积优化有哪些可落地的手段", "首屏优化"),
  q("如何设计一个可水平扩展的消息队列", "MQ扩展"),
  q("简述 HTTPS 握手中证书校验的作用", "TLS证书"),
  q("聊聊 MySQL 死锁的产生条件与排查手段", "死锁排查"),
  q("如何做好前端错误监控与告警", "错误监控"),
];

describe("checkDuplicate —— 单题判定", () => {
  it("R1:归一化后完全相同", () => {
    const hit = checkDuplicate(q("请介绍一下什么是 RAG？", "RAG基础"), [
      q("请介绍一下什么是RAG", "RAG基础"),
    ]);
    expect(hit?.rule).toBe("R1");
  });

  it("R1:只差标点和空白也算同题", () => {
    const hit = checkDuplicate(q("什么是 RAG 召回策略？", "RAG召回"), [
      q("（ 什么是 RAG 召回策略 ）", "RAG召回"),
    ]);
    expect(hit?.rule).toBe("R1");
  });

  it("R2:换措辞的近似题", () => {
    const hit = checkDuplicate(q("如何保证缓存与数据库之间的数据一致性?", "数据一致性"), [
      q("如何保证缓存与数据库之间的数据一致性呢", "存储一致性"),
    ]);
    expect(hit?.rule).toBe("R2");
    expect(hit?.similarity).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("R3:同考点换皮,文字差很远", () => {
    const hit = checkDuplicate(q("如何处理线上服务的限流与熔断", "服务容错"), [
      q("谈谈服务降级与限流策略怎么选", "服务容错"),
    ]);
    expect(hit?.rule).toBe("R3");
  });

  it("确实不同的题不判重", () => {
    const hit = checkDuplicate(q("如何处理线上服务的限流与熔断", "服务容错"), [
      q("Kubernetes 中 Pod 探针失败会导致什么后果", "容器编排"),
    ]);
    expect(hit).toBeNull();
  });

  it("考点相同但题干差得远 → R3 仍能抓住", () => {
    // R2 抓不住(similarity 只有 0.09),R3 兜住
    const hit = checkDuplicate(q("如何处理线上服务的限流与熔断", "服务容错"), [
      q("谈谈服务降级与限流策略怎么选", "服务容错"),
    ]);
    expect(hit?.rule).toBe("R3");
  });

  it("空题库不判重", () => {
    expect(checkDuplicate(q("什么是 RAG", "RAG"), [])).toBeNull();
  });

  it("规则优先级:同题时 R1 胜过 R2/R3", () => {
    const hit = checkDuplicate(q("谈谈向量检索和关键词检索的取舍", "检索策略"), EXISTING);
    expect(hit?.rule).toBe("R1");
  });

  it("规则优先级:R2 胜过 R3", () => {
    // 第一道题近似(R2),第二道题同考点(R3)—— 要报更接近「同一道题」的 R2
    const hit = checkDuplicate(q("如何保证缓存与数据库之间的数据一致性?", "数据一致性"), [
      q("如何保证缓存与数据库之间的数据一致性呢", "存储一致性"),
      q("谈谈数据库的一致性级别", "数据一致性"),
    ]);
    expect(hit?.rule).toBe("R2");
  });
});

describe("checkSetDuplicate —— 套级判定", () => {
  it("阈值与比例是具名常量", () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.82);
    expect(SET_DUPLICATE_RATIO).toBe(0.55);
  });

  it("12 题时 7 题重复 → 判定为高度重复", () => {
    const result = checkSetDuplicate([...DUPLICATES, ...FRESH.slice(0, 5)], EXISTING);
    expect(result.duplicateCount).toBe(7);
    expect(result.threshold).toBe(7);
    expect(result.isDuplicate).toBe(true);
  });

  it("12 题时 6 题重复 → 不判定为高度重复", () => {
    const result = checkSetDuplicate([...DUPLICATES.slice(0, 6), ...FRESH], EXISTING);
    expect(result.duplicateCount).toBe(6);
    expect(result.threshold).toBe(7);
    expect(result.isDuplicate).toBe(false);
  });

  it("6 题时 4 题重复 → 判定为高度重复", () => {
    const result = checkSetDuplicate([...DUPLICATES.slice(0, 4), ...FRESH.slice(0, 2)], EXISTING);
    expect(result.duplicateCount).toBe(4);
    expect(result.threshold).toBe(4);
    expect(result.isDuplicate).toBe(true);
  });

  it("6 题时 3 题重复 → 不判定为高度重复", () => {
    const result = checkSetDuplicate([...DUPLICATES.slice(0, 3), ...FRESH.slice(0, 3)], EXISTING);
    expect(result.duplicateCount).toBe(3);
    expect(result.threshold).toBe(4);
    expect(result.isDuplicate).toBe(false);
  });

  it("阈值按比例算,不写死题数", () => {
    // 12 题 → 7;6 题 → 4:同一个比例,不同题数
    const big = checkSetDuplicate([...DUPLICATES, ...FRESH.slice(0, 5)], EXISTING);
    const small = checkSetDuplicate([...DUPLICATES.slice(0, 4), ...FRESH.slice(0, 2)], EXISTING);
    expect(big.threshold).toBe(Math.ceil(12 * SET_DUPLICATE_RATIO));
    expect(small.threshold).toBe(Math.ceil(6 * SET_DUPLICATE_RATIO));
  });

  it("全是新题 → 不重复", () => {
    const result = checkSetDuplicate(FRESH.slice(0, 5), EXISTING);
    expect(result.duplicateCount).toBe(0);
    expect(result.isDuplicate).toBe(false);
  });

  it("空题库不判重", () => {
    const result = checkSetDuplicate(DUPLICATES.slice(0, 4), []);
    expect(result.duplicateCount).toBe(0);
    expect(result.isDuplicate).toBe(false);
  });

  it("重复比例 = 重复题数 / 本套题数", () => {
    const result = checkSetDuplicate([...DUPLICATES.slice(0, 4), ...FRESH.slice(0, 2)], EXISTING);
    expect(result.ratio).toBeCloseTo(4 / 6, 5);
  });
});

describe("规则常量 —— 规则名不散落在调用方", () => {
  it("规则名是固定的三个", () => {
    const rules: DedupRule[] = ["R1", "R2", "R3"];
    expect(rules).toEqual(["R1", "R2", "R3"]);
  });
});
