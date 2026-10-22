/**
 * 本地规则评价引擎 —— 逐模块给简历打分、挑毛病。
 *
 * 这一层是**不依赖任何外部服务**的:纯函数,输入 ResumeData,输出 ModuleReview[]。
 * 有了它,即使还没配大模型 key,优化模块也能给出真实的评价与方案;
 * 配了 key 之后,大模型的评价会叠加在它之上(见 agent.ts)。
 *
 * 设计原则:
 *   - 只报**能给出具体改法**的问题,不做泛泛而谈
 *   - 每条 finding 都带 target(字段路径),后面的方案与改写都靠它定位
 *   - 不编造事实:检查只说「这里该有个数字」,不替用户填数字
 */
import type { ResumeData } from "@/lib/validation/resume";
import type { Finding, ModuleKey, ModuleReview, Severity } from "./types";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  basics: "基础信息",
  summary: "自我评价",
  work: "工作经历",
  projects: "项目经历",
  skills: "专业技能",
  education: "教育背景",
  languages: "语言能力",
  awards: "获奖荣誉",
  certificates: "资格证书",
  interests: "兴趣爱好",
};

/** 顺序 = 报告里的展示顺序 */
export const MODULE_ORDER: ModuleKey[] = [
  "basics",
  "summary",
  "work",
  "projects",
  "skills",
  "education",
  "languages",
  "awards",
  "certificates",
  "interests",
];

/** 弱动词:简历里最常见的「没干成事」的写法 */
const WEAK_VERBS = [
  "负责",
  "参与",
  "协助",
  "配合",
  "帮助",
  "跟进",
  "支持",
  "负责过",
  "参与过",
  "主要做",
];

/** 量化痕迹:数字 / 百分比 / 倍数 / 规模 */
const QUANT_RE =
  /(\d+\s*%|\d+\s*倍|\d+\s*(万|亿|千|k|K|w|W)|[¥$]\s*\d+|\d+\s*(人|个|次|天|周|月|年|条|页|台|家|项|轮|版|组|类|款|门|篇|场|个)) /;

const HAS_DIGIT = /\d/;

/** 作为技能名时太泛的词 */
const VAGUE_SKILLS = new Set([
  "熟悉",
  "精通",
  "熟练",
  "熟练掌握",
  "掌握",
  "了解",
  "了解程度",
  "良好的",
  "扎实的",
  "良好的沟通能力",
  "团队合作",
  "工作能力",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /1[3-9]\d{9}/;

/** 去掉 HTML 标签后的纯文本长度(自我评价是富文本) */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasQuant(text: string): boolean {
  return QUANT_RE.test(text) || HAS_DIGIT.test(text);
}

/** 命中的弱动词 */
function weakVerbOf(text: string): string | null {
  const head = text.trimStart();
  for (const v of WEAK_VERBS) {
    if (head.startsWith(v)) return v;
  }
  return null;
}

interface Ctx {
  data: ResumeData;
  push: (f: Omit<Finding, "id"> & { id?: string }) => void;
}

function finding(ctx: Ctx, f: Omit<Finding, "id"> & { id?: string }): void {
  ctx.push({ ...f, id: f.id ?? `${f.module}:${f.target ?? f.title}` });
}

/* ─── 各模块的检查 ─────────────────────────────────────────────── */

function checkBasics(ctx: Ctx): void {
  const b = ctx.data.basics;

  if (!b.name.trim()) {
    finding(ctx, {
      module: "basics",
      severity: "error",
      title: "缺少姓名",
      detail: "简历第一行没有姓名,HR 无法判断这份简历属于谁。",
      suggestion: "在基础信息里补上姓名。",
      target: "basics.name",
    });
  }

  if (!b.email.trim()) {
    finding(ctx, {
      module: "basics",
      severity: "error",
      title: "缺少邮箱",
      detail: "没有邮箱等于没有联系方式,简历会被直接跳过。",
      suggestion: "补一个常用邮箱,建议用 Gmail / 163 / QQ 这类不容易被拦的。",
      target: "basics.email",
    });
  } else if (!EMAIL_RE.test(b.email.trim())) {
    finding(ctx, {
      module: "basics",
      severity: "error",
      title: "邮箱格式有问题",
      detail: `「${b.email}」看起来不是有效的邮箱地址。`,
      suggestion: "改成 name@example.com 这种形式,注意不要带空格。",
      target: "basics.email",
    });
  }

  if (!b.phone.trim()) {
    finding(ctx, {
      module: "basics",
      severity: "warn",
      title: "没有手机号",
      detail: "国内校招与社招的简历筛选,手机号基本是硬性要求。",
      suggestion: "补上手机号;不想公开的话,留一个能接到的号即可。",
      target: "basics.phone",
    });
  } else if (!PHONE_RE.test(b.phone.replace(/\D/g, "").slice(0, 11))) {
    finding(ctx, {
      module: "basics",
      severity: "warn",
      title: "手机号格式可能有误",
      detail: `「${b.phone}」不是常见的 11 位手机号。`,
      suggestion: "确认一下号码是否输错,分机号请写全。",
      target: "basics.phone",
    });
  }

  if (!b.label.trim()) {
    finding(ctx, {
      module: "basics",
      severity: "warn",
      title: "没有求职意向",
      detail: "没有目标岗位,HR 只能靠关键词猜你要做什么,猜错就直接进回收站。",
      suggestion: "写清目标岗位,例如「前端工程师」或「产品经理」,带上方向更好。",
      target: "basics.label",
    });
  } else if (b.label.trim().length > 30) {
    finding(ctx, {
      module: "basics",
      severity: "info",
      title: "求职意向写得太长",
      detail: `当前有 ${b.label.trim().length} 字,排版上会挤占抬头位置。`,
      suggestion: "压缩到 20 字以内,一个岗位 + 一个方向就够。",
      target: "basics.label",
    });
  }

  if (!b.location.trim()) {
    finding(ctx, {
      module: "basics",
      severity: "info",
      title: "没有所在地",
      detail: "异地岗位会先看 base 地,缺失会让 HR 多问一轮。",
      suggestion: "填上所在城市即可。",
      target: "basics.location",
    });
  }
}

function checkSummary(ctx: Ctx): void {
  const text = plainText(ctx.data.summary);
  const label = ctx.data.basics.label.trim();

  if (!text) {
    finding(ctx, {
      module: "summary",
      severity: "warn",
      title: "没有自我评价",
      detail: "自我评价是简历里唯一能主动讲「我为什么值这个价」的地方,空着等于放弃解释权。",
      suggestion: label
        ? `用「${label}」开头的三到四句话:年限 + 擅长方向 + 最硬的成果 + 技术栈。`
        : "用三到四句话:年限 + 擅长方向 + 最硬的成果 + 技术栈。",
      target: "summary",
    });
    return;
  }

  if (text.length > 200) {
    finding(ctx, {
      module: "summary",
      severity: "info",
      title: "自我评价偏长",
      detail: `当前 ${text.length} 字,超过 200 字后很少有人会读完。`,
      suggestion: "压到 120-180 字,把最重要的两句放最前面。",
      target: "summary",
    });
  }

  if (!hasQuant(text)) {
    finding(ctx, {
      module: "summary",
      severity: "warn",
      title: "自我评价里没有量化结果",
      detail: "全是形容词的评价没有说服力,HR 无法判断你的贡献量级。",
      suggestion: "补一两个具体数字,例如「支撑日活 50 万+」「接口 P99 从 800ms 降到 120ms」。",
      target: "summary",
    });
  }
}

function checkWork(ctx: Ctx): void {
  const work = ctx.data.work;
  if (work.length === 0) {
    finding(ctx, {
      module: "work",
      severity: "warn",
      title: "没有工作经历",
      detail: "工作经历是简历的主体,空着会让整份简历只剩基本信息。",
      suggestion: "哪怕是实习、兼职或项目制经历,也比空白强。",
      target: "work",
    });
    return;
  }

  work.forEach((w, i) => {
    const tag = `第 ${i + 1} 段经历`;
    const t = (field: string) => `work:${w.id}.${field}`;

    if (!w.period.start.trim()) {
      finding(ctx, {
        module: "work",
        severity: "warn",
        title: `${tag}没有起始时间`,
        detail: "没有起止时间,HR 无法判断经历的长短与连续性。",
        suggestion: "补上起止年月,格式如 2022-03。",
        target: t("period"),
      });
    }
    if (!w.period.end.trim() && !w.period.current) {
      finding(ctx, {
        module: "work",
        severity: "warn",
        title: `${tag}没有结束时间`,
        detail: "既没有结束时间也没标记「至今」,这段经历会显得没写完。",
        suggestion: "填结束年月,或者标记为在职至今。",
        target: t("period"),
      });
    }
    if (!w.position.trim()) {
      finding(ctx, {
        module: "work",
        severity: "info",
        title: `${tag}没有职位名称`,
        detail: "只有公司名时,HR 不知道你在公司里是什么角色。",
        suggestion: "补上职位,例如「高级前端工程师」。",
        target: t("position"),
      });
    }

    const desc = plainText(w.description);
    if (!desc) {
      finding(ctx, {
        module: "work",
        severity: "error",
        title: `${tag}没有工作内容`,
        detail: "这段经历只有公司和职位,没有任何「你做了什么」的描述。",
        suggestion: "写 2-4 条要点,每条用「动词 + 做法 + 结果」的句式。",
        target: t("description"),
      });
      return;
    }

    if (!hasQuant(desc)) {
      finding(ctx, {
        module: "work",
        severity: "warn",
        title: `${tag}的描述里没有量化结果`,
        detail: "「负责XX系统开发」这类描述无法体现贡献量级,很容易被淹没。",
        suggestion: "至少补一个数字:用户量、耗时、覆盖率、效率提升、人数。",
        target: t("description"),
      });
    }

    const weak = weakVerbOf(desc);
    if (weak) {
      finding(ctx, {
        module: "work",
        severity: "info",
        title: `${tag}以「${weak}」开头`,
        detail: `「${weak}」是高频弱动词,读起来像旁观者而不是主导者。`,
        suggestion: `换成更主动的动词,例如「主导 / 落地 / 负责${weak}以外的完整模块」。`,
        target: t("description"),
      });
    }

    if (desc.length > 400) {
      finding(ctx, {
        module: "work",
        severity: "info",
        title: `${tag}的描述过长`,
        detail: `当前 ${desc.length} 字,单条经历就占掉大半页。`,
        suggestion: "压到 150 字以内,只留最有杀伤力的 3-4 条。",
        target: t("description"),
      });
    }
  });
}

function checkProjects(ctx: Ctx): void {
  const projects = ctx.data.projects;
  if (projects.length === 0) {
    finding(ctx, {
      module: "projects",
      severity: "info",
      title: "没有项目经历",
      detail: "项目经历是技术岗最有说服力的部分,校招几乎必看。",
      suggestion: "挑 1-2 个你讲得清、有成果的项目写上。",
      target: "projects",
    });
    return;
  }

  projects.forEach((p, i) => {
    const tag = `第 ${i + 1} 个项目`;
    const t = (field: string) => `projects:${p.id}.${field}`;

    if (!p.role.trim()) {
      finding(ctx, {
        module: "projects",
        severity: "info",
        title: `${tag}没有你的角色`,
        detail: "不知道你在项目里负责什么,HR 只能默认你是打杂的。",
        suggestion: "写清你的角色,例如「前端负责人」或「核心开发」。",
        target: t("role"),
      });
    }
    if (!p.description.trim()) {
      finding(ctx, {
        module: "projects",
        severity: "warn",
        title: `${tag}没有项目描述`,
        detail: "项目只有名字,读者无法判断它的体量与技术含量。",
        suggestion: "写清楚背景、你负责的部分、用了什么技术、最终结果。",
        target: t("description"),
      });
    } else if (!hasQuant(plainText(p.description))) {
      finding(ctx, {
        module: "projects",
        severity: "warn",
        title: `${tag}的描述里没有量化结果`,
        detail: "项目描述没有数字,难以体现项目的规模与你的贡献。",
        suggestion: "补上用户数、模块数、性能指标、周期等可量化的信息。",
        target: t("description"),
      });
    }
    if (!p.url?.trim()) {
      finding(ctx, {
        module: "projects",
        severity: "info",
        title: `${tag}没有可访问的链接`,
        detail: "有 Demo、GitHub 或线上地址时,给链接比任何形容词都管用。",
        suggestion: "填上项目地址或仓库链接。",
        target: t("url"),
      });
    }
  });
}

function checkSkills(ctx: Ctx): void {
  const skills = ctx.data.skills;
  if (skills.length === 0) {
    finding(ctx, {
      module: "skills",
      severity: "warn",
      title: "没有技能列表",
      detail: "HR 筛简历时经常按技术关键词过滤,没有技能列表很容易被直接过滤掉。",
      suggestion: "列出 5-10 项与目标岗位相关的技能,并标注掌握程度。",
      target: "skills",
    });
    return;
  }

  if (skills.length < 3) {
    finding(ctx, {
      module: "skills",
      severity: "warn",
      title: "技能项太少",
      detail: `当前只有 ${skills.length} 项,不足以体现技术覆盖面。`,
      suggestion: "补到 5 项以上,覆盖语言、框架、工具链。",
      target: "skills",
    });
  }

  const vague = skills.filter((s) => VAGUE_SKILLS.has(s.name.trim()));
  if (vague.length > 0) {
    finding(ctx, {
      module: "skills",
      severity: "info",
      title: "技能名里有泛泛的词",
      detail: `「${vague.map((s) => s.name).join("、")}」这类词不是技能,而是程度副词。`,
      suggestion: "换成具体技术名,例如把「熟悉 React」写成「React」。",
      target: "skills",
    });
  }

  const levels = new Set(skills.map((s) => s.level));
  if (levels.size === 1 && skills.length >= 3) {
    finding(ctx, {
      module: "skills",
      severity: "info",
      title: "所有技能都是同一档",
      detail: "全部标成同一个等级,反而显得不真实。",
      suggestion: "区分开:主力技术标高阶,了解的工具标初阶。",
      target: "skills",
    });
  }
}

function checkEducation(ctx: Ctx): void {
  const edu = ctx.data.education;
  if (edu.length === 0) {
    finding(ctx, {
      module: "education",
      severity: "warn",
      title: "没有教育背景",
      detail: "校招简历里教育背景是必填项,社招也是筛简历的硬条件之一。",
      suggestion: "至少写清学校、专业、学历、就读时间。",
      target: "education",
    });
    return;
  }

  edu.forEach((e, i) => {
    const tag = `第 ${i + 1} 条教育`;
    const t = (field: string) => `education:${e.id}.${field}`;

    if (!e.school.trim()) {
      finding(ctx, {
        module: "education",
        severity: "error",
        title: `${tag}没有学校名称`,
        detail: "学校是教育背景的主键,没有它这条记录等于没有。",
        suggestion: "补上学校全称。",
        target: t("school"),
      });
    }
    if (!e.degree.trim()) {
      finding(ctx, {
        module: "education",
        severity: "info",
        title: `${tag}没有学历`,
        detail: "HR 常用学历做硬性筛选,缺失会被误判为未毕业。",
        suggestion: "写明本科 / 硕士 / 博士等。",
        target: t("degree"),
      });
    }
    if (!e.major.trim()) {
      finding(ctx, {
        module: "education",
        severity: "info",
        title: `${tag}没有专业`,
        detail: "专业是判断岗位匹配度的直接依据。",
        suggestion: "补上专业名称。",
        target: t("major"),
      });
    }
    if (!e.period.start.trim()) {
      finding(ctx, {
        module: "education",
        severity: "info",
        title: `${tag}没有就读时间`,
        detail: "缺少时间,无法判断学历是否已经取得。",
        suggestion: "填上入学与毕业年月。",
        target: t("period"),
      });
    }
  });
}

function checkLanguages(ctx: Ctx): void {
  const langs = ctx.data.languages;
  if (langs.length === 0) {
    finding(ctx, {
      module: "languages",
      severity: "info",
      title: "没有语言能力",
      detail: "外企或涉外岗位常把语言能力当作硬门槛。",
      suggestion: "英语写上等级(CET-6 / IELTS / 日常沟通),没有就留空。",
      target: "languages",
    });
    return;
  }
  langs.forEach((l) => {
    if (!l.level.trim()) {
      finding(ctx, {
        module: "languages",
        severity: "info",
        title: `语言「${l.name}」没有标等级`,
        detail: "只写语言名不写水平,参考价值不大。",
        suggestion: "标注等级,例如 CET-6、雅思 7.0、流利。",
        target: "languages",
      });
    }
  });
}

function checkAwards(ctx: Ctx): void {
  const awards = ctx.data.awards;
  if (awards.length === 0) {
    finding(ctx, {
      module: "awards",
      severity: "info",
      title: "没有获奖荣誉",
      detail: "奖学金、竞赛名次都是硬通货,尤其是校招。",
      suggestion: "有就写上,写清年份与颁奖方。",
      target: "awards",
    });
    return;
  }
  awards.forEach((a) => {
    if (!a.date.trim()) {
      finding(ctx, {
        module: "awards",
        severity: "info",
        title: `获奖「${a.title}」没有年份`,
        detail: "没有年份,HR 无法判断是本科还是工作以后拿的。",
        suggestion: "补上获奖年份。",
        target: "awards",
      });
    }
  });
}

function checkCertificates(ctx: Ctx): void {
  const certs = ctx.data.certificates;
  if (certs.length === 0) {
    finding(ctx, {
      module: "certificates",
      severity: "info",
      title: "没有资格证书",
      detail: "从业资格、CET、云厂商认证都能加分。",
      suggestion: "有含金量的证书写上,别堆无关的。",
      target: "certificates",
    });
  }
}

function checkInterests(ctx: Ctx): void {
  const text = plainText(ctx.data.interests);
  if (!text) {
    finding(ctx, {
      module: "interests",
      severity: "info",
      title: "没有兴趣爱好",
      detail: "这一栏在文化面和团队协作评估里偶尔会被问到,但优先级最低。",
      suggestion: "篇幅紧张可以留空;有内容就写一两句真实的。",
      target: "interests",
    });
    return;
  }
  if (text.length > 200) {
    finding(ctx, {
      module: "interests",
      severity: "info",
      title: "兴趣爱好写得太长",
      detail: "当前超过 200 字,挤占了正文的版面。",
      suggestion: "压缩到 1-2 句。",
      target: "interests",
    });
  }
}

const CHECKERS: Record<ModuleKey, (ctx: Ctx) => void> = {
  basics: checkBasics,
  summary: checkSummary,
  work: checkWork,
  projects: checkProjects,
  skills: checkSkills,
  education: checkEducation,
  languages: checkLanguages,
  awards: checkAwards,
  certificates: checkCertificates,
  interests: checkInterests,
};

/* ─── 打分 ─────────────────────────────────────────────────────── */

const SEVERITY_COST: Record<Severity, number> = { error: 20, warn: 9, info: 3 };

export function scoreOf(findings: Finding[]): number {
  const cost = findings.reduce((sum, f) => sum + SEVERITY_COST[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - cost));
}

export function gradeOf(score: number): "good" | "fair" | "poor" {
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

/**
 * 逐模块评价整份简历。
 *
 * 返回的 ModuleReview[] 按 MODULE_ORDER 排序,分数越高越好。
 */
export function analyzeResume(data: ResumeData): ModuleReview[] {
  const ctx: Ctx = { data, push: () => {} };

  return MODULE_ORDER.map((module) => {
    const findings: Finding[] = [];
    const local: Ctx = { data, push: (f) => findings.push(f as Finding) };
    CHECKERS[module](local);
    void ctx;
    const score = scoreOf(findings);
    return {
      module,
      label: MODULE_LABELS[module],
      score,
      grade: gradeOf(score),
      findings,
    };
  });
}

/** 汇总统计 */
export function summarize(reviews: ModuleReview[]): {
  score: number;
  errors: number;
  warns: number;
  infos: number;
} {
  const all = reviews.flatMap((r) => r.findings);
  const errors = all.filter((f) => f.severity === "error").length;
  const warns = all.filter((f) => f.severity === "warn").length;
  const infos = all.filter((f) => f.severity === "info").length;
  // 总分 = 各模块分的平均(没有发现的模块不参与,免得灌水)
  const scored = reviews.filter((r) => r.findings.length > 0);
  const base = scored.length
    ? scored.reduce((s, r) => s + r.score, 0) / scored.length
    : 100;
  const penalty = errors * 4 + warns * 1.5;
  return {
    score: Math.max(0, Math.min(100, Math.round(base - penalty))),
    errors,
    warns,
    infos,
  };
}
