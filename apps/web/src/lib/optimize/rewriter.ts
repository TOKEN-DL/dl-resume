/**
 * 本地改写器 —— 按方案把简历改一遍。
 *
 * 铁律:**只做能被现有事实支撑的改动,绝不编造数字、经历或成果。**
 * 需要用户自己补数字的地方,写进方案(action 里说清楚要补什么),
 * 不往正文里塞占位符 —— 塞进去的占位符会被 PDF 原样导出去,比空着更糟。
 *
 * 这里能安全自动做的四类事:
 *   1. 文本规范化(空白、全角空格、HTML 里的多余空行)
 *   2. 时间格式规范化(2020.03 / 2020年3月 → 2020-03)
 *   3. 排序(经历按时间倒序、技能按掌握程度降序)
 *   4. 自我评价重组(完全由现有字段拼装,不新增事实)
 */
import type { ResumeData } from "@/lib/validation/resume";
import type { Change } from "./types";

/** 折叠多余空白,但不碰 HTML 标签结构 */
function tidy(html: string): string {
  if (!html) return "";
  return html
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\u3000/g, " ") // 全角空格
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 去掉 <li> 里手工写的序号。
 *
 * <li> 本身就会渲染成项目符号,再写「1.」「2.」等于编号两遍,
 * 打印出来是「• 1. …」,一眼就看出来是随手写的。
 *
 * 只动 <li> 里的序号:纯文本段落里的序号往往是唯一的行号线索,删了就丢信息。
 * 分隔符后面必须跟空白或中文,否则「3D 建模」「1.2 版本」会被误伤。
 */
export function stripManualNumbering(html: string): string {
  return html.replace(
    /(<li\b[^>]*>)\s*\d{1,2}\s*[.、)）](?=\s|$|[\u4e00-\u9fff])/gi,
    "$1",
  );
}

/**
 * 可见文本 —— 保留行结构,只压掉行内的多余空白。
 *
 * 报告里的「改前 / 改后」是给人看的:一段话被拆成三条要点之后,
 * 用户得能看出「原来是一坨,现在是一条条」。所以这里的换行必须留着,
 * 只把行内的空白压掉 —— 这跟 analyzer 里用于长度统计的 plainText 不同。
 *
 * 导出去给 provider 用:大模型吐回来的 before/after 也得洗成纯文本,
 * 不然对照里会显示一串 <li> 标签。
 */
export function visibleText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 「2020.03」「2020/3」「2020年3月」→「2020-03」 */
function normalizePeriodValue(v: string): string {
  const s = v.trim();
  if (!s) return s;
  const m = s.match(/(\d{4})\s*[.\/年-]\s*(\d{1,2})/);
  if (m) {
    const mm = m[2].padStart(2, "0");
    return `${m[1]}-${mm}`;
  }
  const y = s.match(/^(\d{4})\s*年?$/);
  if (y) return y[1];
  return s;
}

function periodStart(p: { start: string; end: string; current: boolean }): number {
  const m = p.start.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

/** 换算工作年限(取最早一段经历的起始年到现在) */
function yearsOfExperience(data: ResumeData, now = new Date()): number {
  const starts = data.work
    .map((w) => periodStart(w.period))
    .filter((y) => y > 1900);
  if (starts.length === 0) return 0;
  const earliest = Math.min(...starts);
  const y = now.getFullYear() - earliest + 1;
  return Math.max(0, Math.min(40, y));
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 用现有字段拼一条自我评价。
 *
 * 所有成分都来自简历里已有的信息:求职意向、工作年限、公司、职位、技能。
 * 拼不出来就返回 null(不硬凑)。
 */
export function composeSummary(data: ResumeData): string | null {
  const label = data.basics.label.trim();
  const skills = data.skills
    .map((s) => s.name.trim())
    .filter(Boolean)
    .slice(0, 3);
  const current = data.work.find((w) => w.period.current) ?? data.work[0];
  const years = yearsOfExperience(data);

  if (!label && !current && skills.length === 0) return null;

  const parts: string[] = [];

  if (label && years > 0) {
    parts.push(`${years} 年${label}经验。`);
  } else if (label) {
    parts.push(`${label}。`);
  } else if (years > 0) {
    parts.push(`${years} 年工作经验。`);
  }

  if (current?.company.trim()) {
    const role = current.position.trim();
    parts.push(
      role
        ? `目前在${current.company}担任${role}。`
        : `目前就职于${current.company}。`,
    );
  }

  if (skills.length > 0) {
    parts.push(`核心技术栈:${skills.join("、")}。`);
  }

  const text = parts.join("");
  return text.length > 0 ? text : null;
}

const LEVEL_ORDER: Record<string, number> = {
  expert: 4,
  advanced: 3,
  intermediate: 2,
  beginner: 1,
};

/**
 * 执行本地改写。
 *
 * 返回改写后的简历与一组前后对照。changed 里的 target 与
 * analyzer 产出的 finding.target 用同一套路径,方便把「问题」和「改动」对上。
 */
export function rewriteLocally(data: ResumeData): {
  optimized: ResumeData;
  changes: Change[];
} {
  const optimized: ResumeData = structuredClone(data);
  const changes: Change[] = [];

  /* 1. 自我评价 —— 空的就用现有字段拼一条 */
  const summaryText = plainText(data.summary);
  if (!summaryText) {
    const composed = composeSummary(data);
    if (composed) {
      optimized.summary = composed;
      changes.push({
        target: "summary",
        label: "自我评价",
        before: "",
        after: composed,
      });
    }
  } else {
    const tidied = tidy(data.summary);
    if (tidied !== data.summary) {
      optimized.summary = tidied;
      changes.push({
        target: "summary",
        label: "自我评价",
        before: visibleText(data.summary),
        after: visibleText(tidied),
      });
    }
  }

  /* 2. 工作经历 —— 逐条做文本规范化与时间规范化 */
  optimized.work = optimized.work.map((w) => {
    const label = w.company.trim() || "这段经历";
    const description = stripManualNumbering(tidy(w.description));
    const period = {
      ...w.period,
      start: normalizePeriodValue(w.period.start),
      end: normalizePeriodValue(w.period.end),
    };

    // 改动按**条目粒度**记录 —— 报告里一条问题对应一段前后对照,
    // 而不是把整段经历拼成一大坨。
    // 只在「用户能看出来的内容确实变了」时才记:只差空白/HTML 的改动
    // 摆进对照里反而让人怀疑是不是没改。
    if (visibleText(description) !== visibleText(w.description)) {
      changes.push({
        target: `work:${w.id}.description`,
        label: `${label}的工作内容`,
        before: visibleText(w.description),
        after: visibleText(description),
      });
    }
    if (period.start !== w.period.start || period.end !== w.period.end) {
      changes.push({
        target: `work:${w.id}.period`,
        label: `${label}的时间`,
        before: `${w.period.start} - ${w.period.end || "至今"}`,
        after: `${period.start} - ${period.end || "至今"}`,
      });
    }

    return { ...w, description, period };
  });

  const sortedWork = [...optimized.work].sort(
    (a, b) => periodStart(b.period) - periodStart(a.period),
  );
  if (sortedWork.map((w) => w.id).join() !== optimized.work.map((w) => w.id).join()) {
    changes.push({
      target: "work",
      label: "工作经历顺序",
      // 逐行显示,一行一条 —— 顿号连成一串的话,
      // 三十多项技能排下来根本看不出顺序变了
      before: optimized.work.map((w) => w.company || w.id).join("\n"),
      after: sortedWork.map((w) => w.company || w.id).join("\n"),
    });
    optimized.work = sortedWork;
  }

  /* 3. 项目经历 —— 文本规范化 + 排序 */
  optimized.projects = optimized.projects.map((p) => {
    const description = stripManualNumbering(tidy(p.description));
    if (visibleText(description) !== visibleText(p.description)) {
      changes.push({
        target: `projects:${p.id}.description`,
        label: `${p.name || "项目"}的描述`,
        before: visibleText(p.description),
        after: visibleText(description),
      });
    }
    return {
      ...p,
      description,
      period: {
        ...p.period,
        start: normalizePeriodValue(p.period.start),
        end: normalizePeriodValue(p.period.end),
      },
    };
  });
  const sortedProjects = [...optimized.projects].sort(
    (a, b) => periodStart(b.period) - periodStart(a.period),
  );
  if (
    sortedProjects.map((p) => p.id).join() !== optimized.projects.map((p) => p.id).join()
  ) {
    changes.push({
      target: "projects",
      label: "项目经历顺序",
      before: optimized.projects.map((p) => p.name || p.id).join("\n"),
      after: sortedProjects.map((p) => p.name || p.id).join("\n"),
    });
    optimized.projects = sortedProjects;
  }

  /* 4. 技能 —— 按掌握程度降序 */
  const sortedSkills = [...optimized.skills].sort(
    (a, b) =>
      (LEVEL_ORDER[b.level] ?? 2) - (LEVEL_ORDER[a.level] ?? 2) ||
      a.name.localeCompare(b.name, "zh"),
  );
  if (sortedSkills.map((s) => s.id).join() !== optimized.skills.map((s) => s.id).join()) {
    changes.push({
      target: "skills",
      label: "技能顺序",
      before: optimized.skills.map((s) => s.name).join("\n"),
      after: sortedSkills.map((s) => s.name).join("\n"),
    });
    optimized.skills = sortedSkills;
  }

  /* 5. 其余富文本字段的空白规范化 */
  for (const e of optimized.education) e.description = tidy(e.description);
  for (const a of optimized.awards) a.description = tidy(a.description);
  optimized.interests = stripManualNumbering(tidy(optimized.interests));
  if (visibleText(optimized.interests) !== visibleText(data.interests)) {
    changes.push({
      target: "interests",
      label: "兴趣爱好",
      before: visibleText(data.interests),
      after: visibleText(optimized.interests),
    });
  }

  return { optimized, changes };
}
