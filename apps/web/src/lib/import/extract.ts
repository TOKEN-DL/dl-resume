/**
 * 简历文本 → 结构化字段抽取。
 *
 * 输入是 PDF / Word / Markdown 解析出的纯文本(已剥离 HTML 标签),
 * 输出是能直接喂给 parseResumeData 的 ResumeData。
 *
 * 策略:规则 + 启发式。中文简历格式千差万别,这里只做"高置信度"抽取,
 * 拿不准的留空让用户在表单里补 — 宁可少填,不要填错。
 */

// ─── 联系方式 ───────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d{9}/;
const PHONE_SPACED_RE = /(?:\+?86[-\s]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/;
const URL_RE = /https?:\/\/[^\s，,。；;）)】\]"'<>]+/;
const GITHUB_RE = /(?:github\.com|gitlab\.com|gitee\.com)\/([A-Za-z0-9_-]+)/i;

function extractEmail(text: string): string {
  const m = text.match(EMAIL_RE);
  return m ? m[0] : "";
}

export { extractEmail };

function extractPhone(text: string): string {
  // 优先匹配连续 11 位,其次匹配带分隔符的
  const tight = text.match(PHONE_RE);
  if (tight) return tight[0];
  const spaced = text.match(PHONE_SPACED_RE);
  if (spaced) return spaced[0].replace(/[\s-]/g, "");
  // 兜底:带区号/座机的长数字串
  const loose = text.match(/(?:\+?\d[\d\s-]{9,17}\d)/);
  if (loose) {
    const digits = loose[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return loose[0].trim();
  }
  return "";
}

function extractUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(URL_RE)) found.add(m[0].replace(/[.,;)]+$/, ""));
  return [...found];
}

function extractGithub(text: string): string {
  const m = text.match(GITHUB_RE);
  if (!m) return "";
  return `https://github.com/${m[1]}`;
}

export { extractPhone, extractName, extractGithub };

// ─── 姓名 ───────────────────────────────────────────────────────────

/** 显式标签优先:"姓名:张三" / "Name: Zhang San" */
const NAME_LABEL_RE = /(?:姓\s*名|name|候选 人)[\s:：]\s*([^\s，,。；;|]{1,30})/i;
/** 常见称谓后缀:张先生 / 李女士 / Mr. Wang */
const NAME_HONORIFIC_RE = /([\u4e00-\u9fa5]{2,4})\s*(?:先生|女士|小姐)/;
const NAME_HONORIFIC_EN_RE = /(?:Mr|Mrs|Ms|Dr)\.?\s*([A-Z][a-z]+)/;
/** 英文名:两个以上首字母大写的词,出现在靠前位置 */
const NAME_EN_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/;

function extractName(text: string): string {
  // 1. 显式标签
  const labeled = text.match(NAME_LABEL_RE);
  if (labeled) {
    const v = labeled[1].trim();
    if (v && v.length <= 20 && !/[:：]/.test(v)) return v;
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // 只看前 8 行 — 姓名几乎总在开头
  const head = lines.slice(0, 8);

  // 2. 称谓
  for (const line of head) {
    const m = line.match(NAME_HONORIFIC_RE);
    if (m) return m[1];
  }
  for (const line of head) {
    const m = line.match(NAME_HONORIFIC_EN_RE);
    if (m) return m[1];
  }

  // 3. 英文名(全大写词组合)
  for (const line of head.slice(0, 4)) {
    const m = line.match(NAME_EN_RE);
    // 排除常见非人名词
    if (m && !/Resume|CV|Profile|Engineer|Developer|Manager|University|College/i.test(m[1])) {
      return m[1];
    }
  }

  // 4. 兜底:第一行短且像中文名(2-4 个汉字,不含标点/邮箱/电话)
  if (lines.length > 0) {
    const first = lines[0];
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(first)) return first;
  }
  return "";
}

// ─── 求职意向 / 一句话简介 ──────────────────────────────────────────

/** 表单化的 label 正则,统一在这里维护,便于针对不同模板调整 */
export const LABEL_PATTERNS = {
  desiredPosition:
    /(?:求职意向|应聘岗位|目标岗位|期望职位|意向岗位|应聘职位|desired\s*position|target\s*role|job\s*title)[\s:：]\s*([^\n]{2,40})/i,
  oneLine:
    /(?:一句话简介|一句话介绍|个人简介|自我评价|个人评价|about|summary|profile)[\s:：]\s*([^\n]{2,200})/i,
  location:
    /(?:现居|所在地|所在地|城市|city|location|address)[\s:：]\s*([^\n|｜,，;；]{2,30})/i,
} as const;

const LABEL_RE = LABEL_PATTERNS.desiredPosition;
const SUMMARY_LABEL_RE = LABEL_PATTERNS.oneLine;

function extractLabel(text: string, re: RegExp, maxLen = 60): string {
  const m = text.match(re);
  if (!m) return "";
  let v = m[1].trim();
  // 截到第一个明显分隔符
  v = v.split(/[|｜\t]/)[0].trim();
  if (v.length > maxLen) v = v.slice(0, maxLen);
  return v;
}

/** 供 from-text 复用 */
export { extractLabel, LABEL_RE, SUMMARY_LABEL_RE };

// ─── 章节识别 ───────────────────────────────────────────────────────

export type SectionKey =
  | "basic"
  | "summary"
  | "work"
  | "education"
  | "projects"
  | "skills"
  | "languages"
  | "awards"
  | "certificates"
  | "interests";

interface SectionRule {
  key: SectionKey;
  /** 标题行的匹配模式(中英文 + 常见同义写法) */
  patterns: RegExp[];
  /** 权重越高越先匹配 */
  weight: number;
}

const SECTION_RULES: SectionRule[] = [
  {
    key: "education",
    weight: 100,
    patterns: [
      /^(教育背景|教育经历|教育|学历|学习经历|院校信息|education|educational\s*background|academics?)$/i,
      /^(教育背景|教育经历|教育信息|教育与培训)\s*[:：]?$/i,
    ],
  },
  {
    key: "work",
    weight: 95,
    patterns: [
      /^(工作经历|工作经验|工作履历|职业经历|从业经历|实习经历|工作$|experience|work\s*history|work\s*experience|employment(\s*history)?|professional\s*experience|career\s*history)$/i,
      /^(工作经历|工作履历)\s*[:：]?$/i,
    ],
  },
  {
    key: "projects",
    weight: 90,
    patterns: [
      /^(项目经历|项目经验|项目|作品集|实践经历|projects?|project\s*experience|portfolio)$/i,
      /^(项目经历|项目经验)\s*[:：]?$/i,
    ],
  },
  {
    key: "skills",
    weight: 85,
    patterns: [
      /^(专业技能|技能|技能特长|技术栈|个人技能|专业能力|技术能力|skills?|technical\s*skills|competenc(y|ies))$/i,
      /^(专业技能|技能特长|技术能力)\s*[:：]?$/i,
    ],
  },
  {
    key: "summary",
    weight: 80,
    patterns: [
      /^(个人简介|自我介绍|自我评价|个人评价|简介|about\s*me|summary|profile|objective)$/i,
      /^(个人简介|自我介绍|自我评价)\s*[:：]?$/i,
    ],
  },
  {
    key: "work",
    weight: 60,
    patterns: [
      /^(公司经历|公司概况|就职经历|任职经历|工作业绩)$/i,
    ],
  },
  {
    key: "languages",
    weight: 55,
    patterns: [
      /^(语言能力|语言技能|外语能力|语言|languages?|language\s*skills?)$/i,
    ],
  },
  {
    key: "awards",
    weight: 50,
    patterns: [
      /^(荣誉奖项|获奖经历|奖项|荣誉|所获奖励|荣誉与奖项|awards?|honors?|achievements?)$/i,
    ],
  },
  {
    key: "certificates",
    weight: 48,
    patterns: [
      /^(证书|资格证书|职业资格|专业证书|资质|certificates?|certifications?|licenses?)$/i,
    ],
  },
  {
    key: "interests",
    weight: 45,
    patterns: [
      /^(兴趣爱好|兴趣|爱好|个人兴趣|兴趣特长|interests?|hobbies)$/i,
    ],
  },
  {
    key: "basic",
    weight: 40,
    patterns: [
      /^(个人信息|基本信息|基本资料|联系方式|资料|personal\s*info|personal\s*details|contact|profile\s*info)$/i,
    ],
  },
];

/** 标题行判定:整行短(<=20 字符)且匹配模式 */
function matchSectionHeading(line: string): SectionKey | null {
  const clean = line.trim().replace(/^[#*\s>-]+/, "").replace(/[:：\s]+$/, "").trim();
  if (!clean || clean.length > 20) return null;

  let best: { key: SectionKey; weight: number } | null = null;
  for (const rule of SECTION_RULES) {
    for (const p of rule.patterns) {
      if (p.test(clean)) {
        if (!best || rule.weight > best.weight) best = { key: rule.key, weight: rule.weight };
        break;
      }
    }
  }
  return best?.key ?? null;
}

export interface RawSection {
  key: SectionKey;
  lines: string[];
}

/**
 * 纯引导标签行 —— 冒号结尾、冒号前只是一个短标签。
 *
 * "时间:" / "公司:" / "学历:" 这类行在 PDF 里常单独占一行,内容在下一行。
 * 它们不以句号结尾,会被 findTitleLine 误当成公司名,也会变成一条
 * company="时间:" 的空经历条目。
 */
const LEAD_LABEL_RE = /^[^:：\n]{1,8}[:：]$/;

/** 剥掉列表编号:"1." "1、" "(1)" "1)" */
export function stripListNumber(s: string): string {
  return s.replace(/^\s*\(?\d{1,2}\)?\s*[.、)）:：]\s*/, "").trim();
}

/**
 * 把纯文本按章节标题切分。
 * 未识别到标题的行归入 "basic" 或落到最后一个已知章节(取决于是否有分隔特征)。
 */
export function splitSections(text: string): Map<SectionKey, string[]> {
  const result = new Map<SectionKey, string[]>();
  const push = (k: SectionKey, line: string) => {
    if (!result.has(k)) result.set(k, []);
    result.get(k)!.push(line);
  };

  const lines = text.split(/\r?\n/);
  let current: SectionKey | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = matchSectionHeading(line);
    if (heading) {
      current = heading;
      if (!result.has(heading)) result.set(heading, []);
      continue;
    }

    // 未进入任何章节前的内容 → basic
    if (current === null) push("basic", line);
    else push(current, line);
  }

  // "时间:" 这种引导标签不携带信息,留着只会污染标题行与描述
  for (const [k, v] of result) {
    result.set(
      k,
      v.filter((l) => !LEAD_LABEL_RE.test(l)),
    );
  }

  return result;
}

// ─── 时间范围 ───────────────────────────────────────────────────────

/** "至今/现在/present" 等表示仍在进行的词 */
const PRESENT_WORD = "至今|现在|目前|present|now|current";

/**
 * 时间区间。必须能完整吃掉 `2020.07 - 至今`,否则残留的"至今"
 * 会粘到公司名/项目名前面(实测踩过的坑)。
 *
 * 捕获组:1=起始年 2=起始月 3=结束片段 4=结束年 5=结束月
 * 结束片段要么是"至今/present"这类词(组 4 为 undefined),
 * 要么是 `2024.06` 这样的年月。
 */
const PERIOD_RE = new RegExp(
  `(20\\d{2})(?:\\s*[.\\-/年]\\s*(\\d{1,2})\\s*月?)?` +
    `\\s*(?:至|到|~|–|—|until|to|[-])\\s*` +
    `((20\\d{2})(?:\\s*[.\\-/年]\\s*(\\d{1,2})\\s*月?)?|${PRESENT_WORD})`,
  "i",
);
const SINGLE_YEAR_RE = /(20\d{2})(?:\s*[.\-/年]\s*(\d{1,2})\s*月?)?/;
/** 独立出现的"至今",用于兜底清理标题行 */
const PRESENT_ONLY_RE = new RegExp(`(?:至今|现在|目前|\\bpresent\\b|\\bnow\\b|\\bcurrent\\b)`, "gi");

export interface Period {
  start: string;
  end: string;
  current: boolean;
}

/** 从一行里抽时间区间。找不到返回空 Period。 */
export function extractPeriod(line: string): Period {
  const m = line.match(PERIOD_RE);
  if (m) {
    const [, y1, m1, , y2, m2] = m;
    const start = m1 ? `${y1}-${m1.padStart(2, "0")}` : y1;
    // 没有第二个年份 → 结束端是"至今"
    if (!y2) return { start, end: "", current: true };
    const end = m2 ? `${y2}-${m2.padStart(2, "0")}` : y2;
    return { start, end, current: false };
  }

  // "至今/现在/present" 单独出现 → 当前在职
  if (new RegExp(PRESENT_WORD, "i").test(line)) {
    const y = line.match(SINGLE_YEAR_RE);
    if (y) {
      const start = y[2] ? `${y[1]}-${y[2].padStart(2, "0")}` : y[1];
      return { start, end: "", current: true };
    }
    return { start: "", end: "", current: true };
  }

  // 只有一个年份
  const single = line.match(SINGLE_YEAR_RE);
  if (single) {
    const start = single[2] ? `${single[1]}-${single[2].padStart(2, "0")}` : single[1];
    return { start, end: "", current: false };
  }

  return { start: "", end: "", current: false };
}

/** 判断一行是否"含时间" — 用于识别条目起始行 */
export function lineHasPeriod(line: string): boolean {
  return /20\d{2}/.test(line);
}

// ─── 数组型条目切分 ─────────────────────────────────────────────────

/**
 * 把一个章节的文本切成若干条目。
 * 识别规则(按优先级):
 *  1. Markdown 标题(# / ## / ###)
 *  2. 空行分隔的段落组
 *  3. 含时间区间的行作为条目起点
 */
export function splitEntries(lines: string[]): string[][] {
  if (lines.length === 0) return [];

  // 规则 1:Markdown 标题切分
  const mdHeading = lines.filter((l) => /^#{1,6}\s+/.test(l));
  if (mdHeading.length > 0) {
    const groups: string[][] = [];
    let cur: string[] = [];
    for (const l of lines) {
      if (/^#{1,6}\s+/.test(l)) {
        if (cur.length) groups.push(cur);
        cur = [l.replace(/^#{1,6}\s+/, "").trim()];
      } else {
        cur.push(l);
      }
    }
    if (cur.length) groups.push(cur);
    return groups.map(normalizeEntry).filter((g) => g.length > 0);
  }

  // 规则 2/3:空行 + 时间区间
  const entries: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) entries.push(normalizeEntry(cur));
      cur = [];
      continue;
    }
    // 含时间且当前已有内容 → 认为是新条目起点
    if (cur.length > 0 && lineHasPeriod(l) && !/[•·\-*]/.test(l[0])) {
      entries.push(normalizeEntry(cur));
      cur = [l];
      continue;
    }
    cur.push(l);
  }
  if (cur.length) entries.push(normalizeEntry(cur));
  return entries.filter((g) => g.length > 0);
}

function normalizeEntry(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(/^#{1,6}\s+/, "").replace(/^[-*•·+]\s*/, "").trim())
    .filter(Boolean);
}

// ─── 条目字段抽取 ───────────────────────────────────────────────────

const FIELD_PATTERNS = {
  company: /(?:公司|单位|机构|employer|company|organization)[\s:：]\s*([^\n]{2,50})/i,
  school: /(?:学校|院校|institution|university|school)[\s:：]\s*([^\n]{2,50})/i,
  position: /(?:职位|岗位|职务|头衔|position|title|role)[\s:：]\s*([^\n]{2,40})/i,
  degree: /(?:学历|学位|degree|study\s*type)[\s:：]\s*([^\n]{2,20})/i,
  major: /(?:专业|major)[\s:：]\s*([^\n]{2,40})/i,
  projectName: /(?:项目名称|项目名|project\s*name)[\s:：]\s*([^\n]{2,60})/i,
  role: /(?:角色|担任|职责|role)[\s:：]\s*([^\n]{2,40})/i,
  issuer: /(?:颁发机构|颁发方|发证机构|issuer|awarded\s*by)[\s:：]\s*([^\n]{2,50})/i,
  awarder: /(?:颁发方|授予方|授予单位|awarder|awarded\s*by)[\s:：]\s*([^\n]{2,50})/i,
};

function firstMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

/** 行尾标点 —— 以这些收尾的行是正文,不是标题 */
const TRAILING_PUNCT_RE = /[。；;!！?？:：]$/;

/**
 * 定位条目的标题行,同时给出清洗后的标题文本和它在 entry 里的下标。
 *
 * 下标是必需的:公司名独占一行、职位在下一行时,要看标题的**下一行**。
 * 文本则是清洗结果 —— 含时间的行要先剥掉时间,否则公司名会变成
 * "2020.07 - 至今 字节跳动"。整行只有时间的行不携带主体信息,不算标题。
 */
function findTitleHead(entry: string[]): { index: number; text: string } {
  for (let i = 0; i < entry.length; i++) {
    const l = entry[i];
    if (!lineHasPeriod(l)) continue;
    const parts = l.split(/\s*[|｜]\s*/).filter(Boolean);
    if (parts.length >= 2) {
      const nonPeriod = parts.filter((p) => !/^\s*20\d{2}/.test(p));
      if (nonPeriod.length >= 2) return { index: i, text: nonPeriod.join(" | ").trim() };
      return { index: i, text: parts.map(stripPeriod).filter(Boolean).join(" | ").trim() };
    }
    const cleaned = stripPeriod(l);
    if (cleaned) return { index: i, text: cleaned };
  }
  for (let i = 0; i < entry.length; i++) {
    const l = entry[i];
    // stripPeriod 后为空 = 整行只有时间,不携带主体信息
    if (!stripPeriod(l)) continue;
    if (l.length <= 60 && !TRAILING_PUNCT_RE.test(l) && !/^[•·\-*]/.test(l)) {
      return { index: i, text: l };
    }
  }
  const idx = entry.findIndex((l) => stripPeriod(l));
  return { index: idx, text: idx >= 0 ? entry[idx] : (entry[0] ?? "") };
}

/**
 * 从一个条目(多行)里抽"标题行" — 通常是第一条非纯描述的行。
 */
function findTitleLine(entry: string[]): string {
  return findTitleHead(entry).text;
}

/**
 * 剥离行内的时间区间。
 * "2020.07 - 至今 字节跳动  高级前端工程师" → "字节跳动  高级前端工程师"
 *
 * 注意:这里刻意 **不** 压缩连续空格 —— 多空格是"字段分隔"的强信号,
 * `findTitleParts` 靠它把 学校/专业/学历 三段切开。
 */
function stripPeriod(line: string): string {
  return line
    .replace(PERIOD_RE, " ")
    .replace(PRESENT_ONLY_RE, " ")
    .replace(SINGLE_YEAR_RE, " ")
    .replace(/^\s*[|｜·•\-–—,，]\s*/, "")   // 时间后可能残留的分隔符
    .replace(/[|｜]\s*$/, "")
    .trim();
}

/** 条目类型 —— 不同章节的标题行切分策略不同 */
export type EntryKind = "work" | "education" | "project";

export interface TitleParts {
  /** 公司 / 学校 / 项目名 */
  first: string;
  /** 职位 / 学历 / 项目角色 */
  second: string;
  /** 专业(仅教育) */
  third: string;
}

/** 职位词的结尾特征,用来判断"从哪个 token 开始是职位" */
const ROLE_TAILS = [
  "工程师", "架构师", "设计师", "开发", "经理", "主管", "专员", "分析师",
  "负责人", "总监", "测试", "运营", "产品", "研究", "实习生", "专家",
  "顾问", "助理", "策划", "翻译", "编辑", "科学家",
  "Engineer", "Manager", "Designer", "Developer", "Director", "Scientist",
  "Consultant", "Analyst", "Architect", "Specialist", "Administrator",
  "Coordinator", "Intern", "Lead", "Officer", "Programmer",
];
/** 允许职位词前面带一小段修饰(高级前端 / Senior Software / Full-stack) */
const ROLE_HEAD_RE = new RegExp(
  `[\\u4e00-\\u9fa5A-Za-z0-9+.#()\\-\\s]{0,24}?(?:${ROLE_TAILS.join("|")})`,
  "i",
);

const DEGREE_RE =
  /(本科|硕士|研究生|博士|学士|大专|专科|高中|中专|MBA|EMBA|\b(?:B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?Eng\.?|Ph\.?D\.?|MBA)\b|Bachelor(?:'s)?|Master(?:'s)?|Doctor(?:ate)?|Associate(?:'s)?)/i;

/** 独立成词的学历 —— "本科" / "B.S."。后面跟的内容就该算专业了 */
const STANDALONE_DEGREE_RE =
  /^(本科|硕士|研究生|博士|学士|大专|专科|高中|中专|MBA|EMBA|B\.?S\.?\.?|B\.?A\.?\.?|M\.?S\.?\.?|M\.?A\.?\.?|Ph\.?D\.?)$/i;

/** 学校名的结尾特征 */
const SCHOOL_SUFFIX_RE =
  /(大学|学院|学校|中学|College|University|Institute|School|Academy|Polytechnic)$/i;
/** 会跟着学校名走的地域/性质前缀 */
const SCHOOL_GEO_PREFIX_RE =
  /^(北京|上海|天津|重庆|广东|浙江|江苏|山东|河南|河北|四川|湖北|湖南|安徽|福建|江西|陕西|辽宁|吉林|黑龙江|云南|贵州|广西|山西|内蒙古|新疆|西藏|宁夏|青海|甘肃|海南|中央|国立|香港|澳门|台湾|the|of|and|de|del|la|le)$/i;

/** 标题行按 `|`、Tab、2 个以上空格切字段 */
function splitTitleParts(titleLine: string): string[] {
  return titleLine
    .split(/\s*[|｜]\s*|\t|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 从一个条目里拆出 (主体, 次要信息)。
 * 例:
 *  "字节跳动  高级前端工程师"       → ("字节跳动", "高级前端工程师")
 *  "北京大学  计算机科学与技术  本科" → ("北京大学", "本科", "计算机科学与技术")
 *  "Stripe  Senior Software Engineer" → ("Stripe", "Senior Software Engineer")
 */
export function findTitleParts(entry: string[], kind: EntryKind = "work"): TitleParts {
  const { index: titleIdx, text: titleLine } = findTitleHead(entry);
  if (!titleLine) return { first: "", second: "", third: "" };

  // 显式 label 优先:"公司:字节跳动 | 职位:高级前端"
  const labeled = firstMatch(titleLine, FIELD_PATTERNS.company);
  if (labeled) {
    return {
      first: stripPeriod(labeled),
      second: stripPeriod(firstMatch(titleLine, FIELD_PATTERNS.position)),
      third: "",
    };
  }

  // 多字段分隔(竖线 / 多空格)—— 信号最强,直接用
  const parts = splitTitleParts(titleLine);

  // 教育信息常常一行一项:「学校」「专业」「本科」各占一行。
  // 标题行里没找到学历时,把后面连续的短行也纳入再判一次。
  if (kind === "education") {
    if (parts.length >= 2) return educationParts(parts);
    const base = educationParts(parts);
    if (base.second) return base;
    const extra: string[] = [];
    for (let i = titleIdx + 1; i < entry.length; i++) {
      const l = entry[i];
      if (lineHasPeriod(l) || l.length > 30 || /^[•·\-*]/.test(l) || TRAILING_PUNCT_RE.test(l)) break;
      extra.push(l);
    }
    return extra.length > 0 ? educationParts([...parts, ...extra]) : base;
  }

  if (parts.length >= 2) {
    return { first: parts[0], second: parts.slice(1).join(" "), third: "" };
  }

  const only = (parts[0] ?? titleLine).trim();

  // 公司名单独占一行、职位在下一行 —— PDF 抽文本时很常见的排版
  if (!only.includes(" ")) {
    const next = entry[titleIdx + 1] ?? "";
    if (next && !lineHasPeriod(next) && next.length <= 30 && ROLE_HEAD_RE.test(next)) {
      return { first: only, second: next.trim(), third: "" };
    }
  }

  // 单空格分隔(PDF 抽文本时常发生):找"职位特征词"从哪个 token 开始
  const tokens = only.split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const rest = tokens.slice(i).join(" ");
    if (!ROLE_HEAD_RE.test(rest)) continue;
    const first = tokens.slice(0, i).join(" ");
    if (first.length > 0 && first.length <= 40) return { first, second: rest, third: "" };
  }

  return { first: only, second: "", third: "" };
}

/**
 * 教育标题行 → 学校 / 学历 / 专业。
 *
 * "北京大学  计算机科学与技术  本科" 只有"本科"是学历,其余归专业;
 * "Peking University B.S. Computer Science" 英文单词之间没有分隔符,
 * 只能靠"带 University 后缀的词才是学校名"这条规则定位边界 ——
 * 直接按空格切会把学校名切成 "Peking"。
 */
function educationParts(parts: string[]): TitleParts {
  const tokens = parts
    .flatMap((p) => stripPeriod(p).replace(/\s{2,}/g, " ").trim().split(/\s+/))
    .filter(Boolean);

  if (tokens.length === 0) return { first: "", second: "", third: "" };

  // 显式 label:"学校:北大 | 专业:CS | 学历:本科"
  const joined = tokens.join(" ");
  const labeledDegree = firstMatch(joined, FIELD_PATTERNS.degree);
  if (labeledDegree) {
    return {
      first: stripPeriod(firstMatch(joined, FIELD_PATTERNS.school)) || tokens[0],
      second: stripPeriod(labeledDegree),
      third: stripPeriod(firstMatch(joined, FIELD_PATTERNS.major)),
    };
  }

  const degreeIdx = tokens.findIndex((t) => DEGREE_RE.test(t));
  if (degreeIdx < 0) {
    // 没找到学历词:保守处理 —— 首词当学校,其余当专业
    return { first: tokens[0], second: "", third: tokens.slice(1).join(" ") };
  }

  const head = tokens.slice(0, degreeIdx);
  const tail = tokens.slice(degreeIdx);

  // "B.S." 独立成词 → 学历只有它,后面 "Computer Science" 是专业;
  // "B.S. Computer Science" 一整段 → 学历学位就是这一整段
  let degree: string;
  let majorTail: string[];
  if (tail.length > 1 && STANDALONE_DEGREE_RE.test(tail[0])) {
    degree = tail[0];
    majorTail = tail.slice(1);
  } else {
    degree = tail.join(" ");
    majorTail = [];
  }

  // 学校 = 带"大学/University"后缀的词。
  //
  // PDF 里学校名常右对齐、专业左对齐,按坐标抽出来的顺序会变成
  // 「专业 … 学校」,所以学校名之前的词默认属于专业,只有地域前缀
  // (广东 / 北京 /国立…)才跟着学校名走。英文相反:学校名在句首,
  // 从头一直吃到后缀词。
  let schoolEnd = 0;
  for (let i = head.length - 1; i >= 0; i--) {
    if (SCHOOL_SUFFIX_RE.test(head[i])) {
      schoolEnd = i;
      break;
    }
  }
  let schoolStart = schoolEnd;
  if (/^[\x20-\x7E]+$/.test(head.join(" "))) {
    schoolStart = 0; // 英文:Stanford University / Peking University
  } else {
    while (schoolStart > 0 && SCHOOL_GEO_PREFIX_RE.test(head[schoolStart - 1])) schoolStart--;
  }

  return {
    first: joinTokens(head.slice(schoolStart, schoolEnd + 1)) || tokens[0],
    second: degree,
    third: [...head.slice(0, schoolStart), ...head.slice(schoolEnd + 1), ...majorTail].join(" "),
  };
}

const CJK_CHAR_RE = /[\u4e00-\u9fa5]/;

/** 拼词:中文之间直接接(广东+技术师范大学),中英文之间补空格 */
function joinTokens(tokens: string[]): string {
  return tokens.reduce((acc, t) => {
    if (!acc) return t;
    const prev = acc[acc.length - 1];
    return CJK_CHAR_RE.test(prev) && CJK_CHAR_RE.test(t) ? acc + t : `${acc} ${t}`;
  }, "");
}

const DESCRIPTION_LEAD_RE = /^(描述|说明|职责|工作内容|项目描述|主要工作|介绍|details?|description|summary)[\s:：]/i;

/** 句末标点:出现它说明上一行已经说完,换行是真实分段而不是排版换行 */
const SENTENCE_END_RE = /[。！？；…!?;]$/;
/** 行首条目标记:项目符号或破折号(后面允许跟空格) */
const ITEM_START_RE = /^\s*(?:[•·▪◦*+>]|-{1,2})\s*\S/;
/** 行首编号标记:"1." "1、" "(1)" */
const NUMBERED_ITEM_RE = /^\s*\(?\d{1,2}\)?\s*[.、)）:：]\s*\S/;
/** 抬头行特征:以年月开头 */
const PERIOD_HEAD_RE = /^\s*(?:19|20)\d{2}\s*[.\-/年\s]/;

/**
 * 把 PDF / Word 的"排版换行"还原成逻辑行。
 *
 * 版心宽度会把一句话切成多行,甚至在英文单词中间断开
 * (…DeepSeek- / Embedding-V3…)。这些换行不是语义换行,
 * 直接按行生成 bullet 会让一段经历碎成几十条。
 *
 * 判定"这是新条目而不是续行"的信号(满足其一即断开):
 *  - 上一行是抬头行(以年月开头)
 *  - 上一行以句末标点收尾
 *  - 当前行以项目符号 / 编号 / 年月开头
 *
 * 合并时直接拼接、不补空格 —— 排版断点原本就没有空格,
 * 而真空格会原样留在行尾,补空格反而会制造双空格。
 */
export function mergeWrappedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && shouldMergeWrapped(prev, line)) {
      out[out.length - 1] = prev + line;
      continue;
    }
    out.push(line);
  }
  return out;
}

/** 带冒号的引导标签:"项目背景:" "主要职责:" "技术栈:" —— 段落起点 */
const LABELED_PARAGRAPH_RE = /^[^:：\n]{2,10}[:：]\s*\S/;

function shouldMergeWrapped(prev: string, cur: string): boolean {
  if (PERIOD_HEAD_RE.test(prev)) return false;
  if (SENTENCE_END_RE.test(prev)) return false;
  // "技术部 AI 应用工程师" 这种抬头行不带句号,但它是职位,不是半句话
  if ([...prev].length <= 30 && ROLE_HEAD_RE.test(prev) && !/[：:]\s*\S/.test(prev)) return false;
  if (ITEM_START_RE.test(cur)) return false;
  if (NUMBERED_ITEM_RE.test(cur)) return false;
  if (PERIOD_HEAD_RE.test(cur)) return false;
  if (LABELED_PARAGRAPH_RE.test(cur)) return false;
  return true;
}

/**
 * 条目剩余行 → 富文本 HTML(<ul><li>)。
 * 跳过标题行和 "描述:" 之类的引导词,并先还原排版换行。
 */
export function joinEntryDescription(entry: string[]): string {
  const lines = mergeWrappedLines(
    entry.slice(1).filter((l) => l && !DESCRIPTION_LEAD_RE.test(l)),
  );
  if (lines.length === 0) return "";
  const items = lines
    .map((l) => {
      const t = l.replace(/^[•·\-*+]\s*/, "").trim();
      return t ? `<li>${escapeHtml(t)}</li>` : "";
    })
    .filter(Boolean)
    .join("");
  return `<ul>${items}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── 技能抽取 ───────────────────────────────────────────────────────

interface LevelHint {
  re: RegExp;
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

/**
 * 熟练度关键词。
 * 顺序不代表优先级 —— 实际优先级由"离技能名最近的提示词"决定,
 * 这样 "精通 TypeScript" 和 "了解 Docker" 各自所在的行能分别判定。
 */
const SKILL_LEVEL_HINTS: LevelHint[] = [
  { re: /(精通|熟练掌握|熟练使用|专家级|expert|master(ed)?|proficient)/i, level: "expert" },
  { re: /(熟练|良好|较好|advanced|well\s*versed|experienced)/i, level: "advanced" },
  { re: /(熟悉|掌握|一般|intermediate|familiar\s*with)/i, level: "intermediate" },
  { re: /(了解|基础|入门|接触过|beginner|novice|basic|elementary)/i, level: "beginner" },
];

/** 在一段文本里找最后一次出现的等级提示词 */
function nearestHint(text: string): LevelHint | null {
  let best: { hint: LevelHint; pos: number } | null = null;
  for (const hint of SKILL_LEVEL_HINTS) {
    const re = new RegExp(hint.re.source, "gi");
    let m: RegExpExecArray | null;
    let last = -1;
    while ((m = re.exec(text)) !== null) {
      last = m.index;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (last >= 0 && (!best || last > best.pos)) best = { hint, pos: last };
  }
  return best?.hint ?? null;
}

/**
 * 按"技能名所在的那一行"推断熟练度:
 * 取该行内位于技能名之前的最后一个等级词;没有再看之后的部分。
 * 这样 "精通 A、B" / "了解 C、D" 这种分行列举不会互相污染。
 */
function levelFromContext(text: string, skill: string): ExtractedSkill["level"] {
  const key = skill.toLowerCase();
  const line = text.split(/\r?\n/).find((l) => l.toLowerCase().includes(key));
  if (!line) return "intermediate";

  const idx = line.toLowerCase().indexOf(key);
  const before = nearestHint(line.slice(0, idx));
  if (before) return before.level;
  return nearestHint(line.slice(idx + skill.length))?.level ?? "intermediate";
}

const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "C++", "C#", "PHP", "Ruby", "Swift", "Kotlin", "Scala",
  "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt", "Remix",
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot",
  "HTML", "CSS", "Sass", "Less", "Tailwind", "Bootstrap",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Elasticsearch",
  "Docker", "Kubernetes", "K8s", "Linux", "Nginx", "Jenkins", "CI/CD", "Git", "GitHub Actions",
  "AWS", "Azure", "GCP", "阿里云", "腾讯云",
  "Webpack", "Vite", "Rollup", "esbuild",
  "Prisma", "TypeORM", "Sequelize", "Drizzle",
  "GraphQL", "REST", "WebSocket", "gRPC",
  "Jest", "Vitest", "Cypress", "Playwright", "Selenium",
  "Figma", "Sketch", "Photoshop", "Illustrator", "Axure",
  "Pandas", "NumPy", "TensorFlow", "PyTorch", "Spark", "Hadoop",
  "性能优化", "前端工程化", "微服务", "分布式", "高并发",
];

export interface ExtractedSkill {
  name: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

/** 以这些词开头的是"做了什么",不是技能名 */
const VERB_LEAD_RE =
  /^(能|会|具|通|拥|负责|完成|实现|具备|支持|参与|使用|运用|根据|通过|进行|设计|开发|构建|优化|管理|熟悉|精通|掌握|熟练|了解|良好|深入|擅长|独立|协同|协助|承担|开展|主导)/;
const CJK_RE = /[\u4e00-\u9fa5]/;

/**
 * 判断切出来的片段到底是不是技能名。
 *
 * 触发词"熟练 / 掌握 / 精通"后面只跟一个空格时,整行都会被当成技能列表,
 * 于是"能构建分层评测集…"这种半句话会混进技能表。这里挡住三类噪声:
 *  1. 单字符(切分残留)
 *  2. 以动词开头 —— "做了什么"而不是"是什么"
 *  3. 含空格且含中文 —— "RAG 全链路"是短语,合法技能名是 "Spring Boot" 这种纯英文形态
 */
function looksLikeSentence(fragment: string): boolean {
  if ([...fragment].length < 2) return true;
  if (VERB_LEAD_RE.test(fragment)) return true;
  if (/\s/.test(fragment) && CJK_RE.test(fragment)) return true;
  if (/[。！？；，、]/.test(fragment)) return true;
  return false;
}

/** 从技能章节文本抽取技能列表 */
export function extractSkills(lines: string[]): ExtractedSkill[] {
  const text = lines.join("\n");
  const found: ExtractedSkill[] = [];
  const seen = new Set<string>();

  // 1. 命中已知技能词典(带边界判断,避免 "Go" 匹配 "Google")
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Za-z0-9+#])${escaped}([^A-Za-z0-9+#]|$)`, "i");
    if (re.test(text)) {
      const key = skill.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ name: skill, level: levelFromContext(text, skill) });
      }
    }
  }

  // 2. "技能:JavaScript, React" / "精通 Python、FastAPI" 形式 —— 分隔符切分
  for (const line of lines) {
    const labeled = line.match(
      /(?:技能|技术栈|熟练(?:掌握)?|掌握|熟悉|精通|skills?|tech\s*stack)[\s:：]\s*(.+)$/i,
    );
    if (!labeled) continue;
    const items = labeled[1]
      .split(/[,，、;；/|·]|\s{2,}/)
      .map((s) => s.trim().replace(/[。.]$/, ""));
    for (const item of items) {
      // 去掉 "熟练掌握" 之类前缀
      const clean = item.replace(/^(熟练掌握|熟练|精通|良好|了解|熟悉|掌握)\s*/, "").trim();
      if (!clean || clean.length > 20) continue;
      if (looksLikeSentence(clean)) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ name: clean, level: levelFromContext(line, clean) });
    }
  }

  return found;
}

// ─── 语言抽取 ───────────────────────────────────────────────────────

const LANG_LEVEL_MAP: Record<string, string> = {
  母语: "native", 精通: "native", 熟练: "C2", 流利: "C2",
  良好: "C1", 高级: "C1", 中级: "B2", 日常: "B2", 一般: "B2",
  基础: "A1", 入门: "A1", 初级: "A2",
  native: "native", fluent: "C2", advanced: "C1",
  intermediate: "B2", basic: "A1", beginner: "A1",
};

/**
 * 语言等级清洗。
 * 简历里常见 "流利(CET-6,雅思 7.5)" / "基础(N4)" / "Intermediate (B1)" 这类
 * 带括号补充的写法 —— 必须先砍掉括号及其后面的内容,再查表。
 *
 * 注意:不能只砍左括号,否则 "基础(N4)" 会剩下一个孤零零的 ")" 挂在末尾,
 * 查表必然落空(实测踩过:日语整条等级丢失)。
 */
function normalizeLangLevel(raw: string): string {
  const beforeBracket = raw.replace(/[（(【[].*$/s, "");
  // 去掉残留的收尾标点
  const key = beforeBracket.replace(/[^0-9A-Za-z一-龥]+$/, "").trim();
  if (!key) return "";

  const direct = LANG_LEVEL_MAP[key] ?? LANG_LEVEL_MAP[key.toLowerCase()];
  if (direct) return direct;

  // 英文常写成 "Native speaker" → 取首词
  const firstWord = key.split(/\s+/)[0];
  const byWord = LANG_LEVEL_MAP[firstWord] ?? LANG_LEVEL_MAP[firstWord.toLowerCase()];
  if (byWord) return byWord;

  // 中文常写成 "日常交流" / "熟练掌握" → 退而求其次匹配前缀
  if (/[一-龥]/.test(firstWord)) {
    for (let n = Math.min(firstWord.length, 4); n >= 2; n--) {
      const hit = LANG_LEVEL_MAP[firstWord.slice(0, n)];
      if (hit) return hit;
    }
  }
  return "";
}

const KNOWN_LANGS = [
  "英语", "英文", "日语", "韩语", "法语", "德语", "俄语", "西班牙语", "葡萄牙语", "意大利语",
  "Japanese", "English", "Korean", "French", "German", "Russian", "Spanish", "Portuguese", "Italian",
];

export function extractLanguages(lines: string[]): Array<{ name: string; level: string }> {
  const text = lines.join("\n");
  const out: Array<{ name: string; level: string }> = [];
  const seen = new Set<string>();

  // "英语:流利" / "English - Fluent"
  for (const line of lines) {
    const m = line.match(/([^\s:：\-]{1,12})\s*[:：\-~至到]\s*([^\s,，、;；]{1,12})/);
    if (!m) continue;
    const name = m[1].trim();
    if (!isLanguage(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, level: normalizeLangLevel(m[2]) });
  }

  // 兜底:关键词命中
  if (out.length === 0) {
    for (const lang of KNOWN_LANGS) {
      if (text.includes(lang) && !seen.has(lang.toLowerCase())) {
        seen.add(lang.toLowerCase());
        out.push({ name: lang, level: "" });
      }
    }
  }
  return out;
}

function isLanguage(s: string): boolean {
  return KNOWN_LANGS.some((l) => l.toLowerCase() === s.toLowerCase());
}