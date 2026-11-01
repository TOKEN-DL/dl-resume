/**
 * 跨套判重的编排 —— 本套的题跟题库里已有的题比一遍。
 *
 * 判重的地基在 dedupe.ts(R1 精确 / R2 近似 / R3 同考点),这一层只做三件事:
 *   1. 把题库里的既有题取出来,拼成判重引擎吃得下的形状
 *   2. 逐题判重 —— 记下「哪道题跟哪道重复、命中的是哪条规则」
 *   3. 按**套**算重复率 —— 决定这套题要不要整套拦下
 *
 * 套级判定看的是「与**任一**既有套的重复率」,不是「与整个题库的重复率」:
 * 12 道题分散着跟 3 套各撞 4 道,跟任何一套都不算高度重复,不该整套拦下。
 *
 * 这一层只在服务端跑(要连数据库),前端拿的是存进任务里的结论。
 */
import { checkDuplicate, checkSetDuplicate, type DedupCandidate } from "./dedupe";
import { listQuestionItems, listQuestionSetsByUser } from "./repo";
import type { GeneratedQuestion, JobDedupeHit, JobDedupeResult, JobDedupRule } from "./types";

/** 题库里的一道既有题:判重内容 + 它属于哪一套 */
export interface LibraryItem extends DedupCandidate {
  /** 所属套的 id */
  setId: string;
  /** 所属套的来源简历标题 */
  setTitle: string;
  /** 所属套的创建时间(毫秒时间戳) */
  setCreatedAt: number;
}

/** 题库行里我们用到的几个字段(不依赖仓储层的完整行类型,方便测试) */
export interface LibraryRow {
  question: string;
  topic: string;
  setId: string;
  resumeTitle: string;
  createdAt: Date;
}

/** 题库套行里我们用到的几个字段 */
export interface LibrarySetRow {
  id: string;
  resumeTitle: string;
  createdAt: Date;
}

/** 跨套判重的结论 */
export interface CrossDedupeResult extends JobDedupeResult {
  /** 重复题在本套里的下标(入库时按它过滤) */
  duplicateIndexes: number[];
}

/**
 * 把仓储层的行拼成判重用的「既有题」。
 *
 * 套的标题与创建时间从套表取 —— 提示条上要报得出「与哪一套重复」,
 * 单看题目行是拼不出来的。
 */
export function toLibraryItems(
  items: readonly LibraryRow[],
  sets: readonly LibrarySetRow[],
): LibraryItem[] {
  const meta = new Map(
    sets.map((s) => [s.id, { title: s.resumeTitle, createdAt: toMillis(s.createdAt) }]),
  );
  return items
    .filter((i) => typeof i.question === "string" && i.question.trim())
    .map((i) => ({
      question: i.question,
      topic: i.topic ?? "",
      setId: i.setId,
      setTitle: meta.get(i.setId)?.title ?? i.resumeTitle ?? "",
      setCreatedAt: meta.get(i.setId)?.createdAt ?? toMillis(i.createdAt),
    }));
}

/** 取毫秒时间戳 —— 传进来的不是 Date 就当 0 */
function toMillis(value: Date | undefined | null): number {
  return value instanceof Date ? value.getTime() : 0;
}

/**
 * 取该用户题库里的全部既有题。
 *
 * 不按简历筛 —— 换一份简历也可能问出同一道题,题库是按用户隔离的整体。
 */
export async function loadLibrary(userId: string): Promise<LibraryItem[]> {
  const [items, sets] = await Promise.all([
    listQuestionItems(userId),
    listQuestionSetsByUser(userId),
  ]);
  return toLibraryItems(items, sets);
}

/**
 * 跨套判重:本套的题跟既有题比一遍。
 *
 * 两段结论:
 *   - 逐题:每道题命中哪条规则、跟哪道既有题重复
 *   - 套级:与每一套各算一次重复率,任一套到门槛就算「整套高度重复」
 */
export function dedupeAgainstLibrary(
  candidates: readonly GeneratedQuestion[],
  library: readonly LibraryItem[],
): CrossDedupeResult {
  const totalCount = candidates.length;

  // ── 逐题判重 ──────────────────────────────────────────────
  const hits: JobDedupeHit[] = [];
  const duplicateIndexes: number[] = [];
  candidates.forEach((c, index) => {
    const hit = checkDuplicate({ question: c.question, topic: c.topic }, library);
    if (!hit) return;
    // 命中的那道既有题带着「属于哪一套」的信息
    const matched = hit.matched as LibraryItem;
    duplicateIndexes.push(index);
    hits.push({
      index,
      rule: hit.rule as JobDedupRule,
      similarity: hit.similarity,
      matchedQuestion: matched.question,
      matchedSetId: matched.setId,
      matchedSetTitle: matched.setTitle,
    });
  });

  // ── 套级判定:跟「任一既有套」的重复率 ────────────────────────
  const bySet = new Map<string, LibraryItem[]>();
  for (const item of library) {
    const bucket = bySet.get(item.setId);
    if (bucket) bucket.push(item);
    else bySet.set(item.setId, [item]);
  }

  // 门槛按比例算:12 题 → ceil(12 × 55%) = 7 题重复即触发
  let threshold = checkSetDuplicate(candidates, []).threshold;
  let isDuplicate = false;
  let matchedSet: JobDedupeResult["matchedSet"] = null;
  let bestCount = 0;
  for (const [setId, items] of bySet) {
    const r = checkSetDuplicate(candidates, items);
    threshold = r.threshold;
    if (r.isDuplicate) isDuplicate = true;
    // 重复最多的那一套 = 最像的那一套
    if (r.duplicateCount > bestCount) {
      bestCount = r.duplicateCount;
      matchedSet = {
        id: setId,
        title: items[0]?.setTitle ?? "",
        createdAt: items[0]?.setCreatedAt ?? 0,
      };
    }
  }

  const duplicateCount = duplicateIndexes.length;
  return {
    totalCount,
    duplicateCount,
    ratio: totalCount > 0 ? duplicateCount / totalCount : 0,
    threshold,
    isDuplicate,
    matchedSet,
    hits,
    duplicateIndexes,
  };
}

/**
 * 把判重结论收成「存进任务」的形状。
 *
 * 下标集合是入库时的内部信息,不进任务 —— 任务要发给前端。
 */
export function toJobDedupe(result: CrossDedupeResult): JobDedupeResult {
  return {
    totalCount: result.totalCount,
    duplicateCount: result.duplicateCount,
    ratio: result.ratio,
    threshold: result.threshold,
    isDuplicate: result.isDuplicate,
    matchedSet: result.matchedSet,
    hits: result.hits,
  };
}
