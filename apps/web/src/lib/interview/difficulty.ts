/**
 * 难度的正本 —— 类型、标签、夹边界的函数都只在这里有一份。
 *
 * 为什么单独一个文件:
 *   - 这几样东西原先散在题卡组件、题库组件、生成引擎三处,各写一份 ——
 *     改一次文案要改三个地方,迟早漏掉一处。
 *   - 这个模块会被**客户端组件** import(types.ts 也转发它),
 *     所以它必须**零依赖**:不能顺着 import 链把 node:crypto 之类服务端依赖
 *     带进浏览器包。这里一个 import 都没有,就是为了守住这条。
 *
 * 规矩:别处只准 import 这里的定义,不准再抄一份。
 */

/** 难度档 1-4 */
export type QuestionDifficulty = 1 | 2 | 3 | 4;

/** 题目分类:基础 / 深挖 */
export type QuestionCategory = "basic" | "deep";

/** 四档难度的标签(设计文档 §5.2) */
export const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  1: "入门理解",
  2: "熟练使用",
  3: "原理机制",
  4: "场景深挖",
};

/** 两类分类的标签 */
export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  basic: "基础",
  deep: "深挖",
};

/**
 * 难度夹到 1-4;认不出来的按 1 算。
 *
 * 参数收 unknown:模型返回的 JSON 里难度既可能是数字,也可能是 "3" 这样的字符串,
 * 两边都要能接住。数字走四舍五入再夹边界,其余先按数字解析一次,解析不出来算 1。
 */
export function normalizeDifficulty(value: unknown): QuestionDifficulty {
  const n = typeof value === "number" ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n >= 4) return 4;
  return n as QuestionDifficulty;
}
