/**
 * 出题引擎(generator)—— 本地兜底、模型协议、套内判重。
 *
 * 盯这些:
 *   1. 简历扫描:技能与项目数、关键词池
 *   2. 本地兜底:出满 12 道、四档难度各 3 道、基础/深挖各 6 道、考点两两不同
 *   3. 出题 / 出答案提示词:硬性要求写没写清楚
 *   4. 模型协议解析:难度夹边、空题干丢掉、表情符号剥掉、答案按 index 挂回
 *   5. 套内判重:同考点只留一道
 */
import { describe, it, expect } from "vitest";
import {
  LOCAL_ENGINE_NOTE,
  TOPIC_MISSING_NOTE,
  buildAnswerPrompt,
  buildLocalAnswers,
  buildLocalQuestions,
  buildQuestionPrompt,
  dedupeWithinSet,
  parseAnswerPayload,
  parseQuestionPayload,
  scanResume,
  stripEmoji,
} from "./generator";
import type { GeneratedQuestion } from "./types";
import type { ResumeData } from "@/lib/validation/resume";

/* ─── 测试夹具 ────────────────────────────────────────────────────── */

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    basics: {
      name: "张三",
      label: "后端工程师",
      email: "a@b.com",
      phone: "",
      gender: "",
      location: "",
      avatar: "",
      summary: "",
    },
    summary: "",
    education: [],
    work: [],
    projects: [],
    skills: [],
    languages: [],
    awards: [],
    certificates: [],
    interests: "",
    ...overrides,
  };
}

const RESUME = makeResume({
  skills: [
    { id: "s1", name: "TypeScript", level: "advanced" },
    { id: "s2", name: "PostgreSQL", level: "intermediate" },
    { id: "s3", name: "Redis", level: "intermediate" },
  ],
  projects: [
    { id: "p1", name: "订单中台", role: "后端", period: { start: "", end: "", current: false }, url: "", description: "" },
    { id: "p2", name: "实时风控", role: "后端", period: { start: "", end: "", current: false }, url: "", description: "" },
  ],
});

/** 表情符号探测 —— 与 generator 里剥除用的是同一套范围 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;

function expectNoEmoji(text: string) {
  expect(EMOJI_RE.test(text)).toBe(false);
}

/* ─── 1. 简历扫描 ─────────────────────────────────────────────────── */

describe("scanResume", () => {
  it("数出技能与项目", () => {
    const scan = scanResume(RESUME);
    expect(scan.skillCount).toBe(3);
    expect(scan.projectCount).toBe(2);
  });

  it("关键词来自技能与项目", () => {
    const scan = scanResume(RESUME);
    expect(scan.keywords).toContain("TypeScript");
    expect(scan.keywords).toContain("订单中台");
  });

  it("空简历也不会炸,关键词退回目标岗位", () => {
    const scan = scanResume(makeResume());
    expect(scan.skillCount).toBe(0);
    expect(scan.projectCount).toBe(0);
    expect(scan.keywords.length).toBeGreaterThan(0);
  });
});

/* ─── 2. 本地兜底出题 ─────────────────────────────────────────────── */

describe("本地兜底出题", () => {
  const questions = buildLocalQuestions(scanResume(RESUME));

  it("出满 12 道题", () => {
    expect(questions).toHaveLength(12);
  });

  it("四档难度各 3 道", () => {
    const counts = new Map<number, number>();
    for (const q of questions) counts.set(q.difficulty, (counts.get(q.difficulty) ?? 0) + 1);
    expect([...counts.entries()].sort()).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });

  it("基础 6 道、深挖 6 道", () => {
    expect(questions.filter((q) => q.category === "basic")).toHaveLength(6);
    expect(questions.filter((q) => q.category === "deep")).toHaveLength(6);
  });

  it("每档难度里的基础/深挖配比固定:前两档 2:1,后两档 1:2", () => {
    for (const level of [1, 2, 3, 4] as const) {
      const at = questions.filter((q) => q.difficulty === level);
      const basic = at.filter((q) => q.category === "basic").length;
      const deep = at.filter((q) => q.category === "deep").length;
      if (level <= 2) expect([basic, deep]).toEqual([2, 1]);
      else expect([basic, deep]).toEqual([1, 2]);
    }
  });

  it("按难度升序排 —— 前面偏基础,后面偏深挖", () => {
    const levels = questions.map((q) => q.difficulty);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("考点两两不同(否则套内判重会把自己的题判成重复)", () => {
    const topics = questions.map((q) => q.topic);
    expect(new Set(topics).size).toBe(questions.length);
  });

  it("题干带上了简历里的关键词", () => {
    expect(questions.some((q) => q.question.includes("TypeScript"))).toBe(true);
    expect(questions.some((q) => q.question.includes("订单中台"))).toBe(true);
  });

  it("题干里没有表情符号", () => {
    for (const q of questions) expectNoEmoji(q.question);
  });

  it("参考答案只是要点提纲,不是编出来的成果", () => {
    const answers = buildLocalAnswers(questions);
    expect(answers).toHaveLength(12);
    for (const a of answers) {
      expect(a.trim().length).toBeGreaterThan(0);
      expect(a).toContain("要点");
    }
  });

  it("参考答案里没有表情符号", () => {
    for (const a of buildLocalAnswers(questions)) expectNoEmoji(a);
  });

  it("兜底模式的说明写在引擎备注里", () => {
    expect(LOCAL_ENGINE_NOTE).toContain("本地兜底");
  });

  it("避开已经出过的题:同一份简历再押一次,出的题换一组", () => {
    const again = buildLocalQuestions(
      scanResume(RESUME),
      questions.map((q) => q.question),
    );
    expect(again).toHaveLength(12);
    expect(again.map((q) => q.question)).not.toEqual(questions.map((q) => q.question));
  });

  it("避开之后考点依然两两不同(套内判重不会自伤)", () => {
    const again = buildLocalQuestions(
      scanResume(RESUME),
      questions.map((q) => q.question),
    );
    expect(new Set(again.map((q) => q.topic)).size).toBe(12);
  });

  it("关键词池刚好整除 12 时,第二轮也不会跟第一轮撞死", () => {
    // 池长 6 —— 12 能被它整除。按「已出题数」轮转的话轮转量是 0,
    // 第二套跟第一套一字不差,用户从此押不出新题(回归用例)。
    const wide = makeResume({
      skills: [
        { id: "s1", name: "TypeScript", level: "advanced" },
        { id: "s2", name: "PostgreSQL", level: "intermediate" },
        { id: "s3", name: "Redis", level: "intermediate" },
        { id: "s4", name: "Docker", level: "intermediate" },
        { id: "s5", name: "Kubernetes", level: "intermediate" },
        { id: "s6", name: "React", level: "intermediate" },
      ],
      projects: [],
    });
    const first = buildLocalQuestions(scanResume(wide));
    const second = buildLocalQuestions(
      scanResume(wide),
      first.map((q) => q.question),
    );
    expect(second).toHaveLength(12);
    // 两轮加起来 24 道**互不相同**的题
    expect(new Set([...first, ...second].map((q) => q.question)).size).toBe(24);
  });

  it("组合用尽时退回原组合(由上层判重去拦,不假装还能出新的)", () => {
    // 池长 1 → 组合空间只有 12 个 → 第二轮必然重复
    const narrow = makeResume({
      skills: [{ id: "s1", name: "TypeScript", level: "advanced" }],
      projects: [],
    });
    const first = buildLocalQuestions(scanResume(narrow));
    const second = buildLocalQuestions(
      scanResume(narrow),
      first.map((q) => q.question),
    );
    expect(second.map((q) => q.question)).toEqual(first.map((q) => q.question));
  });
});

/* ─── 3. 模型协议:出题 ────────────────────────────────────────────── */

describe("出题提示词", () => {
  const { system, user } = buildQuestionPrompt(RESUME);

  it("要求严格 12 道", () => {
    expect(system).toContain("12");
  });

  it("要求四档难度固定分布", () => {
    expect(system).toContain("难度");
    expect(system).toContain("基础");
    expect(system).toContain("深挖");
  });

  it("要求每题带考点关键词", () => {
    expect(system).toContain("topic");
  });

  it("明令不许编造简历里没有的内容", () => {
    expect(system).toContain("编造");
  });

  it("明令只输出 JSON,并给出输出格式", () => {
    expect(system).toContain("JSON");
    expect(system).toContain("questions");
  });

  it("用户提示词带上简历与目标岗位", () => {
    expect(user).toContain("后端工程师");
    expect(user).toContain("TypeScript");
  });

  it("用户提示词里的简历去掉了头像", () => {
    const withAvatar = makeResume({
      basics: { ...makeResume().basics, avatar: "data:image/png;base64,AAAA" },
    });
    expect(buildQuestionPrompt(withAvatar).user).not.toContain("base64");
  });
});

/**
 * 生成前规避(第一道防线)—— 把这个用户已经出过的题干喂给模型,让它绕开。
 * 这是主力防线:模型不出重复题,后面的判重就没什么可拦的。
 */
describe("出题提示词 · 避开已出过的题", () => {
  const asked = ["什么是 RAG？", "讲讲 Redis 的持久化"];

  it("用户提示词带上已出过的题干", () => {
    const { user } = buildQuestionPrompt(RESUME, asked);
    expect(user).toContain("什么是 RAG？");
    expect(user).toContain("讲讲 Redis 的持久化");
  });

  it("明确标出这一段是「已出过的题目」,并要求避开", () => {
    const { system, user } = buildQuestionPrompt(RESUME, asked);
    expect(user).toContain("已出过的题目");
    expect(system).toContain("避开");
  });

  it("没有已出过的题时不加这一段", () => {
    expect(buildQuestionPrompt(RESUME).user).not.toContain("已出过的题目");
  });
});

describe("出答案提示词", () => {
  const kept: GeneratedQuestion[] = [
    { question: "聊聊 TypeScript 的类型体操", topic: "TypeScript 类型体操", category: "basic", difficulty: 2 },
  ];
  const { system, user } = buildAnswerPrompt(RESUME, kept);

  it("要求给可背诵的要点,不许写空话", () => {
    expect(system).toContain("要点");
    expect(system).toContain("空话");
  });

  it("明令不许编造", () => {
    expect(system).toContain("编造");
  });

  it("只输出 JSON,index 是题目序号", () => {
    expect(system).toContain("JSON");
    expect(system).toContain("index");
  });

  it("用户提示词带上题目清单与简历", () => {
    expect(user).toContain("TypeScript 的类型体操");
    expect(user).toContain("后端工程师");
  });
});

/* ─── 4. 模型协议:解析 ────────────────────────────────────────────── */

describe("出题结果解析", () => {
  it("解析标准 JSON", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "什么是索引?", topic: "索引原理", category: "basic", difficulty: 1 },
          { question: "索引怎么设计?", topic: "索引设计", category: "deep", difficulty: 3 },
        ],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.questions).toHaveLength(2);
    expect(parsed!.questions[0].topic).toBe("索引原理");
    expect(parsed!.questions[0].difficulty).toBe(1);
    expect(parsed!.topicMissing).toBe(false);
  });

  it("能处理 ```json 围栏与思考块", () => {
    const parsed = parseQuestionPayload(
      "<think>先想一下</think>\n```json\n" +
        JSON.stringify({ questions: [{ question: "什么是索引?", topic: "索引原理", category: "basic", difficulty: 1 }] }) +
        "\n```",
    );
    expect(parsed!.questions).toHaveLength(1);
  });

  it("难度超出范围会被夹到 1-4", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "A", topic: "t1", category: "basic", difficulty: 9 },
          { question: "B", topic: "t2", category: "basic", difficulty: 0 },
        ],
      }),
    );
    expect(parsed!.questions[0].difficulty).toBe(4);
    expect(parsed!.questions[1].difficulty).toBe(1);
  });

  it("空题干被丢掉", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({
        questions: [
          { question: "  ", topic: "t1", category: "basic", difficulty: 1 },
          { question: "有效的题", topic: "t2", category: "basic", difficulty: 1 },
        ],
      }),
    );
    expect(parsed!.questions).toHaveLength(1);
    expect(parsed!.questions[0].question).toBe("有效的题");
  });

  it("缺考点时标记 topicMissing,好让引擎备注里说明精度下降", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({ questions: [{ question: "有效的题", category: "basic", difficulty: 1 }] }),
    );
    expect(parsed!.topicMissing).toBe(true);
    expect(parsed!.questions[0].topic).toBe("");
    expect(TOPIC_MISSING_NOTE).toContain("考点");
  });

  it("题干里的表情符号被剥掉", () => {
    const parsed = parseQuestionPayload(
      JSON.stringify({ questions: [{ question: "什么是索引? 🚀", topic: "t", category: "basic", difficulty: 1 }] }),
    );
    expectNoEmoji(parsed!.questions[0].question);
  });

  it("完全不是 JSON 时返回 null", () => {
    expect(parseQuestionPayload("模型今天不想说话")).toBeNull();
  });
});

describe("出答案结果解析", () => {
  it("按 index 把答案挂回题目", () => {
    const map = parseAnswerPayload(
      JSON.stringify({ answers: [{ index: 0, answer: "答案零" }, { index: 1, answer: "答案一" }] }),
      2,
    );
    expect(map.get(0)).toBe("答案零");
    expect(map.get(1)).toBe("答案一");
  });

  it("越界的 index 被丢掉(不猜不编)", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 5, answer: "越界" }] }), 2);
    expect(map.size).toBe(0);
  });

  it("缺 index 的题目拿不到答案", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 0, answer: "有" }] }), 3);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
  });

  it("答案里的表情符号被剥掉", () => {
    const map = parseAnswerPayload(JSON.stringify({ answers: [{ index: 0, answer: "要点 ✅" }] }), 1);
    expectNoEmoji(map.get(0)!);
  });
});

describe("stripEmoji", () => {
  it("剥掉常见表情,保留中文正文", () => {
    expect(stripEmoji("🚀 讲讲你的项目 🎯")).toBe("讲讲你的项目");
  });
});

/* ─── 5. 套内判重 ─────────────────────────────────────────────────── */

describe("套内判重", () => {
  const base: GeneratedQuestion[] = [
    { question: "介绍一下 RAG 的召回策略", topic: "RAG 召回策略", category: "basic", difficulty: 1 },
    { question: "RAG 的召回策略你为什么这么选", topic: "RAG 召回策略", category: "deep", difficulty: 2 },
    { question: "聊聊向量数据库的选型", topic: "向量数据库选型", category: "basic", difficulty: 1 },
  ];

  it("同一套里同考点的题只留一道", () => {
    const { kept, skipped } = dedupeWithinSet(base);
    expect(kept).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(kept[0].question).toBe("介绍一下 RAG 的召回策略");
  });

  it("完全不同的题都留下", () => {
    const { kept, skipped } = dedupeWithinSet([base[0], base[2]]);
    expect(kept).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it("一字不差的重复会被抓掉", () => {
    const { skipped } = dedupeWithinSet([
      { question: "什么是索引?", topic: "索引", category: "basic", difficulty: 1 },
      { question: "什么是索引?", topic: "别的考点", category: "basic", difficulty: 1 },
    ]);
    expect(skipped).toBe(1);
  });

  it("考点为空时不启用同考点判定", () => {
    const { kept, skipped } = dedupeWithinSet([
      { question: "什么是索引?", topic: "", category: "basic", difficulty: 1 },
      { question: "什么是索引?", topic: "", category: "basic", difficulty: 1 },
    ]);
    expect(skipped).toBe(1);
    expect(kept).toHaveLength(1);
  });
});

describe("本地兜底的题不会被自己的判重吃掉", () => {
  it("12 道模板题两两不重复,一道都不被跳过", () => {
    const { kept, skipped } = dedupeWithinSet(buildLocalQuestions(scanResume(RESUME)));
    expect(skipped).toBe(0);
    expect(kept).toHaveLength(12);
  });
});
