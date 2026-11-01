/**
 * 归一化与指纹 —— 判重引擎的地基。
 *
 * 同一道题在不同批次里可能被写成
 * 「请介绍一下什么是 RAG?」「什么是 RAG」「（ 什么是 RAG ）」,
 * 肉眼一看是三道题,归一化之后必须收敛成一道。
 *
 * 这一层是**纯函数**:只进字符串,只出字符串,不碰数据库、网络、模型。
 */
import { createHash } from "node:crypto";

/** 指纹长度:sha1 取前 16 位十六进制 */
export const FINGERPRINT_LENGTH = 16;

/** 最多剥几轮开头填充词 —— 再多就会伤到题干本体 */
export const MAX_FILLER_STRIP_ROUNDS = 2;

/**
 * 开头填充词表 —— 模型出题时最爱加的口头禅。
 * 命中一条就从开头剥掉一条,一轮最多剥一条。
 */
const FILLER_PREFIXES: readonly string[] = [
  "请介绍一下",
  "介绍一下",
  "请谈谈",
  "谈谈",
  "说说",
  "请说说",
  "简述",
  "描述一下",
  "请描述",
  "说一下",
  "聊聊",
  "请聊一下",
];

/** 长的优先 —— 「请介绍一下」要先于「介绍一下」被剥掉 */
const FILLERS_LONGEST_FIRST = [...FILLER_PREFIXES].sort((a, b) => b.length - a.length);

/** 全角 ASCII 区(U+FF01–U+FF5E)对应半角,整体偏移 0xFEE0 */
const FULLWIDTH_PATTERN = /[\uFF01-\uFF5E]/g;
const FULLWIDTH_OFFSET = 0xfee0;

/** 所有空白,含全角空格 */
const WHITESPACE_PATTERN = /\s+/g;

/** 所有标点 —— Unicode 的 P 类覆盖中英文标点 */
const PUNCTUATION_PATTERN = /\p{P}/gu;

/**
 * 归一化:全角 → 半角,转小写,去空白,去标点,剥开头填充词。
 *
 * 顺序按设计文档 §4.3 定死:填充词要在标点去掉之后才剥,
 * 否则「请介绍一下,什么是 RAG」会卡在填充词上剥不干净。
 */
export function normalize(text: string): string {
  let out = text
    .replace(FULLWIDTH_PATTERN, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_OFFSET),
    )
    .toLowerCase()
    .replace(WHITESPACE_PATTERN, "")
    .replace(PUNCTUATION_PATTERN, "");

  for (let round = 0; round < MAX_FILLER_STRIP_ROUNDS; round++) {
    const filler = FILLERS_LONGEST_FIRST.find((f) => out.startsWith(f));
    if (!filler) break;
    out = out.slice(filler.length);
  }
  return out;
}

/**
 * 指纹:归一化文本的 sha1 前 16 位。
 *
 * 库里给 (userId, fingerprint) 建了唯一索引 —— 一道题在一个用户下只能存一份,
 * 这是「不重复入库」的硬约束,应用层的判定只是软拦截。
 */
export function fingerprint(text: string): string {
  return createHash("sha1").update(normalize(text), "utf8").digest("hex").slice(0, FINGERPRINT_LENGTH);
}

/** 取相邻两字符组成的集合 —— 中文按字、英文按字符 */
function bigrams(text: string): Set<string> {
  const chars = Array.from(text);
  const set = new Set<string>();
  for (let i = 0; i + 1 < chars.length; i++) set.add(chars[i] + chars[i + 1]);
  return set;
}

/**
 * 相似度:两个归一化文本的字符 bigram 集合的 Jaccard。
 *
 * 退化输入的约定:
 *   - 归一化后完全相同 → 1
 *   - 任一方不足两字符 → 0(构不成 bigram,无从比起)
 *   - 归一化后都是空串 → 0(没有内容可比)
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length > 0 && na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const setA = bigrams(na);
  const setB = bigrams(nb);
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
