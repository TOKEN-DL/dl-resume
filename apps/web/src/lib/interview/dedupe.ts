/**
 * 三层判重引擎 —— 一道题是否重复,一整套题是否与某一套高度重复。
 *
 * 判重是这个功能风险最高的一块:
 *   - 判重了 → 用户白白丢题,明明是新题却提示重复
 *   - 判漏了 → 题库里堆满同一道题的换皮版本,「不重复入库」名存实亡
 * 所以判定必须是**纯逻辑**:不碰数据库、网络、模型调用,
 * 输入给定的题和已有的题,输出确定的结论。
 *
 * 三层规则(命中任一即判重复):
 *   R1 精确 —— 归一化后完全相同,抓一字不差的重复
 *   R2 近似 —— 字符 bigram 的 Jaccard ≥ SIMILARITY_THRESHOLD,抓换标点换措辞的微调
 *   R3 同考点 —— 考点归一化后相同,抓换皮问法
 *
 * R3 是关键一层:模型每次出的「同考点不同问法」文本相似度往往只有 0.3~0.5,
 * 靠 R2 抓不住;让模型在生成时自己标注考点,等于让它先把问题归一化了一次,
 * 判定退化成确定性的字符串相等。
 */
import { normalize, similarity } from "./fingerprint";

/** R2 近似的相似度门槛 —— 换标点换措辞的微调要抓得住,换皮问法留给 R3 */
export const SIMILARITY_THRESHOLD = 0.82;

/** 套级重复率门槛 —— 本套题与某一套的重复题数占比达到它就算「整套高度重复」 */
export const SET_DUPLICATE_RATIO = 0.55;

/** 命中的规则 */
export type DedupRule = "R1" | "R2" | "R3";

/** 参与判重的一道题:题干 + 考点 */
export interface DedupCandidate {
  /** 题干 */
  question: string;
  /** 考点关键词(模型生成时自己标注) */
  topic: string;
}

/** 单题判重的结论 */
export interface DedupHit {
  /** 命中的规则 */
  rule: DedupRule;
  /** 与之重复的那道既有题 */
  matched: DedupCandidate;
  /** 相似度 —— R1 恒为 1,R3 是题干相似度(通常很低) */
  similarity: number;
}

/** 套级判重的结论 */
export interface SetDedupResult {
  /** 是否判定为「整套高度重复」 */
  isDuplicate: boolean;
  /** 与既有题重复的题数 */
  duplicateCount: number;
  /** 本套题总数 */
  totalCount: number;
  /** 重复率 = 重复题数 / 本套题总数 */
  ratio: number;
  /** 触发门槛所需的重复题数 = ceil(总题数 × SET_DUPLICATE_RATIO) */
  threshold: number;
}

/**
 * 考点归一化。
 *
 * 考点是模型给的关键词(如「RAG 召回策略」),
 * 比题干更短更规整,所以只做大小写与空白归一,不去标点也不剥填充词 ——
 * 考点本来就该是关键词,剥掉「说说」反而可能把不同考点剥成同一个。
 */
function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/\s+/g, "");
}

/**
 * 单题判重:这道题跟既有题里的一道重复吗?
 *
 * 规则优先级 R1 > R2 > R3 —— 同题时先报更确定的结论。
 * 既有题里命中多条时,取相似度最高的那条。
 */
export function checkDuplicate(
  candidate: DedupCandidate,
  existing: readonly DedupCandidate[],
): DedupHit | null {
  const candidateNorm = normalize(candidate.question);
  // 题干归一化后为空(全是标点)→ 没有可比的正文,不参与判重
  if (!candidateNorm) return null;

  const candidateTopic = normalizeTopic(candidate.topic);
  let bestR2: DedupHit | null = null;
  let bestR3: DedupHit | null = null;

  for (const item of existing) {
    const itemNorm = normalize(item.question);
    if (!itemNorm) continue;

    // R1:归一化后完全相同 —— 最确定的结论,直接返回
    if (itemNorm === candidateNorm) {
      return { rule: "R1", matched: item, similarity: 1 };
    }

    const sim = similarity(candidate.question, item.question);

    // R2:近似 —— 同规则内取相似度最高的那条
    if (sim >= SIMILARITY_THRESHOLD && (!bestR2 || sim > bestR2.similarity)) {
      bestR2 = { rule: "R2", matched: item, similarity: sim };
    }

    // R3:同考点(考点为空则不比 —— 两个空考点不构成「同考点」)
    if (candidateTopic && candidateTopic === normalizeTopic(item.topic)) {
      if (!bestR3 || sim > bestR3.similarity) {
        bestR3 = { rule: "R3", matched: item, similarity: sim };
      }
    }
  }

  // R2 比 R3 更接近「同一道题」,优先报 R2
  return bestR2 ?? bestR3;
}

/**
 * 套级判重:这一整套题,跟既有题库比,是不是高度重复?
 *
 * 门槛按**比例**算,不写死题数:
 *   12 题时 → ceil(12 × 0.55) = 7 题重复即触发
 *   6 题时  → ceil(6 × 0.55) = 4 题重复即触发
 * 模型只出了 6 题也照样拦得住。
 */
export function checkSetDuplicate(
  candidates: readonly DedupCandidate[],
  existing: readonly DedupCandidate[],
): SetDedupResult {
  const totalCount = candidates.length;
  // 用整数百分比算,避开 0.55 在浮点里的表示误差
  const threshold = Math.ceil((totalCount * Math.round(SET_DUPLICATE_RATIO * 100)) / 100);

  let duplicateCount = 0;
  for (const candidate of candidates) {
    if (checkDuplicate(candidate, existing)) duplicateCount++;
  }

  return {
    isDuplicate: totalCount > 0 && duplicateCount >= threshold,
    duplicateCount,
    totalCount,
    ratio: totalCount > 0 ? duplicateCount / totalCount : 0,
    threshold,
  };
}
