/**
 * 出题引擎 —— 把一份简历变成一组「题干 + 考点 + 难度 + 分类」,再补上参考答案。
 *
 * 两条出题路径:
 *   1. **模型路径**:配了 MINIMAX_API_KEY 时走 MiniMax。一次调用出全部题干,
 *      查重之后再用第二次调用补参考答案 —— 不在会被丢掉的题上白烧 token。
 *   2. **本地兜底**:没配密钥(或模型调不通)时,按技能名与项目名套模板出题,
 *      参考答案只给**要点提纲**。这时结果里一定带 engineNote,UI 上会明确标注。
 *
 * 这一层是**纯逻辑 + 两次模型调用**,不碰数据库、不管进度、不管权限。
 * 进度推进在 runner.ts,任务存储在 job-store.ts。
 */
import { chat, extractJson, hasMiniMaxKey } from "@/lib/llm/chat";
import { checkDuplicate, type DedupCandidate } from "./dedupe";
import { normalizeDifficulty } from "./difficulty";
import { fingerprint } from "./fingerprint";
import type {
  GeneratedQuestion,
  QuestionCategory,
  QuestionDifficulty,
  QuestionProvider,
} from "./types";
import type { ResumeData } from "@/lib/validation/resume";
import { stripHeavyFields } from "@/lib/optimize/providers/provider";

/* ─── 引擎备注 ────────────────────────────────────────────────────── */

/** 本地兜底时写进结果里的说明 */
export const LOCAL_ENGINE_NOTE = "本地兜底:模板化问题,参考答案仅为要点提纲";

/** 模型没给考点时的说明 —— 同考点判定(R3)用不上,精度下降 */
export const TOPIC_MISSING_NOTE = "考点标注缺失,重复判定精度下降";

/* ─── 表情符号 ────────────────────────────────────────────────────── */

/**
 * 表情符号范围:emoji 主块 + 装饰符号 + 杂项符号 + 变体选择符。
 *
 * 题干与参考答案里**不许出现表情符号** —— 题目是要背的、带表情的题干读起来
 * 像聊天记录,不像考题。模型爱在答案里塞「✅」「🚀」,所以入库前统一剥一遍。
 */
const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu;

/** 剥掉表情符号,并收拾剥剩下的多余空格 */
export function stripEmoji(text: string): string {
  return text
    .replace(EMOJI_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/* ─── 1. 简历扫描 ─────────────────────────────────────────────────── */

export interface ScanResult {
  /** 技能条数 */
  skillCount: number;
  /** 项目段数 */
  projectCount: number;
  /** 出题用的关键词池:技能名 + 项目名 */
  keywords: string[];
}

/**
 * 扫描简历:抽出技能与项目,凑成出题用的关键词池。
 *
 * 关键词池空了(简历还没填技能和项目)也不阻断 —— 退回目标岗位,
 * 再不行就用「项目经历」占位,保证模板出题器永远能出满 12 道。
 */
export function scanResume(data: ResumeData): ScanResult {
  const skills = (data.skills ?? [])
    .map((s) => s.name.trim())
    .filter(Boolean);
  const projects = (data.projects ?? [])
    .map((p) => p.name.trim())
    .filter(Boolean);

  const keywords: string[] = [];
  for (const s of skills) if (!keywords.includes(s)) keywords.push(s);
  for (const p of projects) if (!keywords.includes(p)) keywords.push(p);

  if (keywords.length === 0) {
    keywords.push(data.basics?.label?.trim() || "项目经历");
  }

  return { skillCount: skills.length, projectCount: projects.length, keywords };
}

/* ─── 2. 本地兜底:模板出题 ────────────────────────────────────────── */

/**
 * 12 个模板槽位 —— 题目分布写死在这里。
 *
 * 四档难度各 3 题;前两档偏基础(2 基础 + 1 深挖),后两档偏深挖(1 基础 + 2 深挖),
 * 基础与深挖各 6 道。前面偏基础、后面偏深挖,与「从易到难」一致。
 *
 * 每个槽位带一个**互不相同的考点后缀** —— 考点是「关键词 + 后缀」,
 * 后缀不重复就保证同一套 12 题的考点两两不同,套内判重(R3)不会把自己的题判重。
 */
interface Slot {
  difficulty: QuestionDifficulty;
  category: QuestionCategory;
  topicSuffix: string;
  template: string;
}

const SLOTS: readonly Slot[] = [
  // 难度 1 入门理解:2 基础 + 1 深挖
  { difficulty: 1, category: "basic", topicSuffix: "基础用法", template: "你在 {kw} 上是怎么入门的?讲讲最常用的部分。" },
  { difficulty: 1, category: "basic", topicSuffix: "使用场景", template: "什么情况下你会选 {kw}?为什么选它?" },
  { difficulty: 1, category: "deep", topicSuffix: "上手踩坑", template: "刚开始用 {kw} 时你踩过哪些坑?后来怎么解决的?" },
  // 难度 2 熟练使用:2 基础 + 1 深挖
  { difficulty: 2, category: "basic", topicSuffix: "熟练用法", template: "你对 {kw} 的哪些用法已经用得很熟?举一个你写过的例子。" },
  { difficulty: 2, category: "basic", topicSuffix: "最佳实践", template: "团队里用 {kw} 有哪些约定或最佳实践?你遵守了哪些?" },
  { difficulty: 2, category: "deep", topicSuffix: "疑难排查", template: "遇到 {kw} 的疑难问题时,你的排查思路是什么?" },
  // 难度 3 原理机制:1 基础 + 2 深挖
  { difficulty: 3, category: "basic", topicSuffix: "工作原理", template: "能讲讲 {kw} 的工作原理吗?用你自己能听懂的话说。" },
  { difficulty: 3, category: "deep", topicSuffix: "性能瓶颈", template: "{kw} 在什么情况下会成为性能瓶颈?你怎么定位的?" },
  { difficulty: 3, category: "deep", topicSuffix: "方案取舍", template: "如果要替换掉 {kw},你会考虑哪些替代方案?取舍在哪?" },
  // 难度 4 场景深挖:1 基础 + 2 深挖
  { difficulty: 4, category: "basic", topicSuffix: "方案设计", template: "如果让你从零设计一个用到 {kw} 的系统,你会怎么设计?" },
  { difficulty: 4, category: "deep", topicSuffix: "线上事故", template: "{kw} 相关出过什么线上问题?当时怎么定位和止损的?" },
  { difficulty: 4, category: "deep", topicSuffix: "量化收益", template: "你在 {kw} 这块做出过什么量化改进?数字是怎么来的?" },
];

/**
 * 本地兜底出题:按关键词套模板出满 12 道。
 *
 * 模板题不编造简历里没有的东西 —— 问句问的是「你」做过什么,
 * 答案提纲也只提醒用户自己组织语言,不给现成成果。
 *
 * usedQuestions:这份简历**已经出过的题干**。避让靠的是这些题干本身,
 * 不是「已经出过几道题」。
 *
 * 为什么不能按题数轮转关键词池 —— 那看着省事,实际会撞死:
 * 关键词池 6 个、已入库 12 题时,轮转量 12 % 6 = 0,
 * 第二套跟第一套**一模一样**,用户从此再也押不出新题,题库里的题一道都没多。
 * 池长是 3 / 4 / 6 / 12 时都会踩到(12 能被它们整除)。
 *
 * 所以这里按「槽位 × 关键词」的**组合**去重:每个槽位依次试池里的关键词,
 * 挑第一个没出过的组合。组合空间 = 槽位数 × 关键词数(12 × 6 = 72),
 * 够用户押好几轮。真用完了就退回原组合,由上层的套级判重去拦,
 * 并如实告诉用户「这套与题库里已有的题高度重复」—— 不假装还能出新的。
 */
export function buildLocalQuestions(
  scan: ScanResult,
  usedQuestions: readonly string[] = [],
): GeneratedQuestion[] {
  const pool = scan.keywords.length > 0 ? scan.keywords : ["项目经历"];
  // 已出过的题干的指纹 —— 归一化后比较,「请介绍一下X」与「X」算同一道
  const used = new Set(
    usedQuestions
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter(Boolean)
      .map((q) => fingerprint(q)),
  );

  return SLOTS.map((slot, i) => {
    // 依次试池里的关键词,挑第一个**没出过**的组合;
    // 全都用过了就退回第一个关键词 —— 重复交给上层判重去拦
    let keyword = pool[i % pool.length];
    let question = "";
    for (let k = 0; k < pool.length; k++) {
      const candidate = pool[(i + k) % pool.length];
      const candidateQuestion = stripEmoji(slot.template.replace(/\{kw\}/g, candidate));
      if (!used.has(fingerprint(candidateQuestion))) {
        keyword = candidate;
        question = candidateQuestion;
        break;
      }
    }
    if (!question) {
      question = stripEmoji(slot.template.replace(/\{kw\}/g, keyword));
    }

    return {
      question,
      topic: stripEmoji(`${keyword} ${slot.topicSuffix}`),
      category: slot.category,
      difficulty: slot.difficulty,
    };
  });
}

/**
 * 本地兜底出答案:只给**要点提纲**,不给现成答案。
 *
 * 提纲提醒用户按「结论 — 做法 — 结果」组织语言 ——
 * 押题页的价值是帮他自己想,不是替他背。
 */
export function buildLocalAnswers(questions: GeneratedQuestion[]): string[] {
  return questions.map((q) =>
    [
      "答题要点(提纲,不是完整答案):",
      `1. 围绕考点「${q.topic}」先用一句话给结论`,
      "2. 结合简历里的实际场景,讲清你具体做了什么、怎么做的",
      "3. 补一个可验证的细节:数据、步骤,或者当时放弃了什么方案",
      "自己组织语言时按「结论 — 做法 — 结果」三段走。",
    ].join("\n"),
  );
}

/* ─── 3. 模型协议:提示词 ──────────────────────────────────────────── */

/** 目标岗位 —— 优先用求职意向 */
function targetOf(data: ResumeData): string {
  return data.basics?.label?.trim() || "未填写";
}

/**
 * 出题提示词。
 *
 * 三条硬约束写死在系统提示词里:
 *   - 严格 12 道,四档难度 × 3,基础/深挖按固定配比(设计文档 §5.2)
 *   - 每题必须带考点关键词,同一个考点只能出现一次(否则 R3 判重会自伤)
 *   - **绝不编造简历里没有的经历、公司、数字** —— 押题题库会被反复翻,
 *     编出来的题比没有题更糟
 *
 * existingQuestions 是这份简历**已经出过的题干**(生成前规避的第一道防线):
 * 带上它,模型就会绕开这些题 —— 换一种问法、换一个考点都不行。
 */
export function buildQuestionPrompt(
  data: ResumeData,
  existingQuestions: readonly string[] = [],
): { system: string; user: string } {
  const asked = existingQuestions.map((q) => q.trim()).filter(Boolean);

  const system = [
    "你是一位资深技术面试官,正在针对候选人的简历出面试题。",
    "",
    "硬性要求:",
    "1. 严格输出 12 道题,难度分布固定:难度 1(入门理解)3 题、难度 2(熟练使用)3 题、难度 3(原理机制)3 题、难度 4(场景深挖)3 题。",
    "2. 分类分布固定:难度 1 与难度 2 各含 2 道基础(basic)与 1 道深挖(deep);难度 3 与难度 4 各含 1 道基础与 2 道深挖。基础与深挖各 6 道。",
    "3. 每题必须带 topic(考点关键词,2-4 个词)。同一个考点在这 12 道题里只能出现一次。",
    "4. 只依据简历里写到的内容提问。绝对不要编造简历里没有的经历、公司、项目、数字或成果。",
    "5. 题干里不要出现表情符号。",
    "6. 只输出 JSON,不要输出任何解释文字。输出格式:",
    '{"questions":[{"question":"题干","topic":"考点","category":"basic|deep","difficulty":1}]}',
  ];

  if (asked.length > 0) {
    system.push(
      "7. 用户给出的「已出过的题目」绝对不要再出 —— 连换个说法、换个例子都不行,考点也要避开。",
    );
  }

  const user = [
    `目标岗位:${targetOf(data)}`,
    "",
    "候选人简历(JSON):",
    JSON.stringify(stripHeavyFields(data), null, 2),
  ];

  if (asked.length > 0) {
    user.push(
      "",
      "已出过的题目(这份简历之前问过的,请务必避开,不要重复考):",
      ...asked.map((q, i) => `${i + 1}. ${q}`),
    );
  }

  user.push("", "请针对上面这份简历出 12 道面试题,严格按要求的分布输出。");

  return { system: system.join("\n"), user: user.join("\n") };
}

/**
 * 出答案提示词。
 *
 * index 是**传进去的题目清单里的序号**(0 起),模型按序号回答案;
 * 越界或缺号的题,答案留空并在 UI 上标注「参考答案生成失败」—— 不猜、不编。
 */
export function buildAnswerPrompt(
  data: ResumeData,
  questions: GeneratedQuestion[],
): { system: string; user: string } {
  const system = [
    "你是一位资深技术面试官,正在为候选人的面试题给出参考答案要点。",
    "",
    "硬性要求:",
    "1. 答案要具体、可背诵:给出可以照着讲的关键要点,不要写「要深入理解原理」这类空话。",
    "2. 只依据简历里写到的内容作答,不要编造简历里没有的成果、数据或经历。",
    "3. 答案里不要出现表情符号。",
    "4. 只输出 JSON,不要输出任何解释文字。输出格式:",
    '{"answers":[{"index":0,"answer":"参考答案要点"}]}',
    "index 是下面题目清单里的序号(从 0 开始),每一道题都要有且只有一个答案。",
  ].join("\n");

  const list = questions.map((q, index) => ({
    index,
    question: q.question,
    topic: q.topic,
    category: q.category,
    difficulty: q.difficulty,
  }));

  const user = [
    `目标岗位:${targetOf(data)}`,
    "",
    "候选人简历(JSON):",
    JSON.stringify(stripHeavyFields(data), null, 2),
    "",
    "需要作答的题目清单:",
    JSON.stringify(list, null, 2),
    "",
    "请为清单里的每一道题给出参考答案要点,严格按 index 一一对应。",
  ].join("\n");

  return { system, user };
}

/* ─── 4. 模型协议:解析 ────────────────────────────────────────────── */

export interface ParsedQuestions {
  questions: GeneratedQuestion[];
  /** 模型没给考点 —— 同考点判定(R3)用不上,精度下降 */
  topicMissing: boolean;
}

/**
 * 解析出题结果。
 *
 * 解析层要做三件「宁可少也不乱」的事:
 *   - 题干为空的条目**丢掉**(模型偶尔会吐一个空对象)
 *   - 难度夹到 1-4、分类认不出来按基础算(不静默吞掉异常值)
 *   - 表情符号剥掉、考点为空的标成 topicMissing
 *
 * 返回 null 表示模型输出根本不是 JSON —— 调用方据此决定要不要退回本地兜底。
 */
export function parseQuestionPayload(raw: string): ParsedQuestions | null {
  const parsed = extractJson<{ questions?: unknown }>(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const list = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions: GeneratedQuestion[] = [];
  let topicMissing = false;

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const question = typeof rec.question === "string" ? stripEmoji(rec.question) : "";
    if (!question.trim()) continue;

    const topic = typeof rec.topic === "string" ? stripEmoji(rec.topic) : "";
    if (!topic) topicMissing = true;

    questions.push({
      question,
      topic,
      category: rec.category === "deep" ? "deep" : "basic",
      difficulty: normalizeDifficulty(rec.difficulty),
    });
  }

  return { questions, topicMissing };
}

/**
 * 解析出答案结果:index → 答案。
 *
 * 越界、缺号、答案为空的一律**不收** —— 那些题的参考答案留空,
 * UI 上标注「参考答案生成失败」,不拿别的题的答案顶替,也不自己编一段。
 */
export function parseAnswerPayload(raw: string, count: number): Map<number, string> {
  const map = new Map<number, string>();
  const parsed = extractJson<{ answers?: unknown }>(raw);
  if (!parsed || typeof parsed !== "object") return map;

  const list = Array.isArray(parsed.answers) ? parsed.answers : [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    let index: number;
    if (typeof rec.index === "number") index = Math.trunc(rec.index);
    else if (typeof rec.index === "string" && rec.index.trim() !== "")
      index = Math.trunc(Number(rec.index));
    else continue;

    if (!Number.isInteger(index) || index < 0 || index >= count) continue;

    const answer = typeof rec.answer === "string" ? stripEmoji(rec.answer) : "";
    if (!answer) continue;

    map.set(index, answer);
  }

  return map;
}

/* ─── 5. 套内判重 ─────────────────────────────────────────────────── */

/**
 * 套内判重:同一套题里,后出的题跟**前面已经生成过的题**比。
 *
 * 比的是全部已生成的题(不只是留下来的),这样「A 像 B、B 像 C」的链式重复
 * 也抓得住。命中任一条规则(R1 精确 / R2 近似 / R3 同考点)就算重复。
 *
 * 跨套判重与套级拦截是 #22 的活,本片只做套内。
 */
export function dedupeWithinSet(questions: GeneratedQuestion[]): {
  kept: GeneratedQuestion[];
  skipped: number;
} {
  const kept: GeneratedQuestion[] = [];
  const generated: DedupCandidate[] = [];
  let skipped = 0;

  for (const q of questions) {
    const candidate: DedupCandidate = { question: q.question, topic: q.topic };
    if (checkDuplicate(candidate, generated)) skipped += 1;
    else kept.push(q);
    generated.push(candidate);
  }

  return { kept, skipped };
}

/* ─── 6. 对外的两次调用 ───────────────────────────────────────────── */

export interface GenerateOutcome {
  questions: GeneratedQuestion[];
  /**
   * 这套题是谁出的 —— 入库时原样写进题库的 provider 字段。
   *
   * 显式返回,而不是让调用方去猜 engineNote 里有没有「本地兜底」四个字 ——
   * 那是在拿文案当数据用,改一次文案就错一次。
   */
  provider: QuestionProvider;
  /** 引擎说明:走了兜底或降级时才有 */
  engineNote?: string;
}

export interface AnswerOutcome {
  /** 与传进去的题目一一对应;空串表示这道题没拿到答案 */
  answers: string[];
  engineNote?: string;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 出题(第一次模型调用)。
 *
 * existingQuestions 是这份简历**已经出过的题干** —— 带上它,模型就会绕开,
 * 这是生成前规避的第一道防线(也是主力防线)。
 *
 * 什么时候走本地兜底:
 *   - 没配 MINIMAX_API_KEY —— 主路径
 *   - 模型调不通(网络/鉴权/超时)或输出根本不是 JSON —— 兜底并写明原因
 *
 * 什么时候**不**兜底:模型正常返回了但一道题都没有 ——
 * 设计文档 §6.4 说这种情况任务失败(「模型没有生成出任何题目」),
 * 因为那说明提示词或模型出了问题,拿模板题糊弄过去只会把问题藏起来。
 */
export async function generateQuestions(
  data: ResumeData,
  existingQuestions: readonly string[] = [],
): Promise<GenerateOutcome> {
  const scan = scanResume(data);
  const asked = existingQuestions.map((q) => q.trim()).filter(Boolean);
  // 兜底模板是固定的:靠「组合去重」避开已经出过的题
  const local = (): GeneratedQuestion[] => buildLocalQuestions(scan, asked);

  if (!hasMiniMaxKey()) {
    return { questions: local(), provider: "local", engineNote: LOCAL_ENGINE_NOTE };
  }

  let raw: string;
  try {
    const { system, user } = buildQuestionPrompt(data, asked);
    raw = await chat(system, user);
  } catch (e) {
    return {
      questions: local(),
      provider: "local",
      engineNote: `${LOCAL_ENGINE_NOTE};模型调用失败:${errorText(e)}`,
    };
  }

  const parsed = parseQuestionPayload(raw);
  if (!parsed) {
    return {
      questions: local(),
      provider: "local",
      engineNote: `${LOCAL_ENGINE_NOTE};模型输出无法解析`,
    };
  }
  if (parsed.questions.length === 0) {
    throw new Error("模型没有生成出任何题目");
  }

  return {
    questions: parsed.questions,
    provider: "minimax",
    engineNote: parsed.topicMissing ? TOPIC_MISSING_NOTE : undefined,
  };
}

/**
 * 出答案(第二次模型调用)—— 只针对去重后保留下来的题。
 *
 * 模型正常返回、但某些 index 缺失时,那些题的答案**留空**;
 * UI 会把它们标成「参考答案生成失败」(题卡组件自带这个兜底文案)。
 */
export async function generateAnswers(
  data: ResumeData,
  questions: GeneratedQuestion[],
): Promise<AnswerOutcome> {
  const local = (): string[] => buildLocalAnswers(questions);

  if (!hasMiniMaxKey()) {
    return { answers: local(), engineNote: LOCAL_ENGINE_NOTE };
  }

  let raw: string;
  try {
    const { system, user } = buildAnswerPrompt(data, questions);
    raw = await chat(system, user);
  } catch (e) {
    return {
      answers: local(),
      engineNote: `${LOCAL_ENGINE_NOTE};模型调用失败:${errorText(e)}`,
    };
  }

  const map = parseAnswerPayload(raw, questions.length);
  return { answers: questions.map((_, i) => map.get(i) ?? "") };
}
