/**
 * Skill 加载器 —— 把 `skills/` 目录里的 SKILL.md 读成给大模型用的提示词。
 *
 * 为什么不让提示词写死在 TS 里:
 * skill 文件是**方法论与输出契约的正本**。同一份文件既能被人读、能被 agent 加载,
 * 也能被这里的代码喂给大模型 —— 改一处,三边同时生效,不会各说各话。
 * 部署者想调整「简历优化」的口径,直接编辑 `skills/resume-optimizer/SKILL.md` 即可,
 * 不需要改代码、不需要重新构建镜像。
 *
 * 找不到文件时返回 null,调用方据此退回本地规则引擎 ——
 * 宁可用本地引擎给出确定性的结果,也不要拿一份残缺的提示词去糊弄用户。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** 本项目用到的 skill —— 名字即 `skills/<name>/SKILL.md` 的目录名 */
export type SkillName = "resume-optimizer" | "resume-interview";

/**
 * skill 目录的候选位置。
 *
 * `SKILL_DIR` 是**排他性覆盖** —— 设了就只看那一个目录,不再回退到内置位置。
 * 不排他的话,指向一个空目录会静默读到内置 skill,「我明明覆盖了」这种情况很难查。
 *
 * 不设时的两个候选覆盖常见的 cwd:
 *   - `apps/web` —— dev 与 Next standalone 运行时(server.js 会 chdir 到自己所在目录)
 *   - 仓库根     —— 万一从仓库根启动
 */
function skillDirCandidates(): string[] {
  const override = (process.env.SKILL_DIR ?? "").trim();
  if (override) return [override];
  const cwd = process.cwd();
  return [path.join(cwd, "skills"), path.join(cwd, "apps", "web", "skills")];
}

/** 去掉 YAML frontmatter —— 那段是给 agent 看的元数据,不是给大模型的指令 */
function stripFrontmatter(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return (m ? text.slice(m[0].length) : text).trim();
}

/**
 * 抽出具名小节。
 *
 * 小节用 HTML 注释包起来:`<!-- skill:review -->…<!-- /skill:review -->`。
 * 选它是因为**注释在 Markdown 渲染时不显示** —— 人类读 SKILL.md 看到的是连贯的方法论,
 * 而代码能稳定地按名字取到需要的那一段。
 */
function extractSection(body: string, section: string): string | null {
  const re = new RegExp(
    `<!--\\s*skill:${section}\\s*-->\\r?\\n([\\s\\S]*?)<!--\\s*/skill:${section}\\s*-->`,
  );
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 抽出前言 —— 第一个小节标记之前的那段。
 *
 * 前言里放着角色设定和全局约束(不编造、只依据简历……),这些约束对每一小节都成立,
 * 所以小节不能脱离前言单独使用。
 */
function extractIntro(body: string): string {
  const idx = body.search(/<!--\s*skill:/);
  if (idx < 0) return "";
  return body.slice(0, idx).trim();
}

const cache = new Map<string, string | null>();

/**
 * 读一个 skill 的正文(已去 frontmatter)。
 *
 * @param name skill 名
 * @returns 正文;文件读不到返回 null
 */
export function loadSkill(name: SkillName): string | null {
  const key = `full:${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let body: string | null = null;
  for (const dir of skillDirCandidates()) {
    const file = path.join(dir, name, "SKILL.md");
    try {
      body = stripFrontmatter(readFileSync(file, "utf8"));
      if (body) break;
      body = null;
    } catch {
      /* 试下一个候选位置 */
    }
  }

  cache.set(key, body);
  return body;
}

/**
 * 读一个 skill 里的具名小节 —— **前言 + 小节**。
 *
 * 应用里每次调模型只需要其中一段(审阅归审阅、改写归改写),
 * 整份灌进去既浪费 token,又会让模型同时收到两套不相干的输出契约。
 *
 * 前言必须带上:角色设定和"不编造"这类全局约束写在 preface 里,
 * 少了它,小节就成了没有立场的操作手册。
 *
 * 小节不存在时回退到整份正文 —— 总比没有强。
 */
export function loadSkillSection(name: SkillName, section: string): string | null {
  const key = `section:${name}:${section}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const body = loadSkill(name);
  let result: string | null = null;
  if (body) {
    const part = extractSection(body, section);
    const intro = extractIntro(body);
    if (part) {
      result = intro ? `${intro}\n\n${part}` : part;
    } else {
      result = body;
    }
  }

  cache.set(key, result);
  return result;
}

/** 有没有可用 skill —— 调用方据此决定要不要走模型路径 */
export function hasSkill(name: SkillName): boolean {
  return loadSkill(name) !== null;
}

/** 只给测试用:清掉缓存(改了磁盘文件后要能重新读到) */
export function clearSkillCache(): void {
  cache.clear();
}
