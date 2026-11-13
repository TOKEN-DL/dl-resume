/**
 * skill 加载器的测试。
 *
 * 重点验证三件事:
 *   1. 能读到仓库里的 skill,frontmatter 被剥掉
 *   2. 具名小节抽得出来,而且**带着前言**(角色设定不能丢)
 *   3. 读不到时返回 null —— 调用方据此退回本地引擎,而不是拿半截提示词去调模型
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  clearSkillCache,
  hasSkill,
  loadSkill,
  loadSkillSection,
} from "./skill";

const originalSkillDir = process.env.SKILL_DIR;
let tmp: string | null = null;

/** 在临时目录里造一个 skill,用来测各种边界 */
function writeSkill(dir: string, name: string, body: string): void {
  const skillDir = path.join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), body, "utf8");
}

beforeEach(() => {
  clearSkillCache();
  tmp = mkdtempSync(path.join(tmpdir(), "dl-resume-skill-"));
  process.env.SKILL_DIR = tmp;
});

afterAll(() => {
  if (originalSkillDir === undefined) delete process.env.SKILL_DIR;
  else process.env.SKILL_DIR = originalSkillDir;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("loadSkill", () => {
  it("读到 skill 正文,并剥掉 YAML frontmatter", () => {
    writeSkill(
      tmp!,
      "resume-optimizer",
      ["---", "name: resume-optimizer", "description: 测试用", "---", "", "正文第一行"].join("\n"),
    );

    const body = loadSkill("resume-optimizer");
    expect(body).toBe("正文第一行");
    expect(body).not.toContain("name: resume-optimizer");
  });

  it("没有 frontmatter 时原样返回", () => {
    writeSkill(tmp!, "resume-optimizer", "直接是正文");
    expect(loadSkill("resume-optimizer")).toBe("直接是正文");
  });

  it("目录不存在时返回 null(不是抛异常)", () => {
    expect(loadSkill("resume-interview")).toBeNull();
  });

  it("hasSkill 跟着文件在不在变", () => {
    expect(hasSkill("resume-optimizer")).toBe(false);
    writeSkill(tmp!, "resume-optimizer", "正文");
    clearSkillCache();
    expect(hasSkill("resume-optimizer")).toBe(true);
  });
});

describe("loadSkillSection", () => {
  const BODY = [
    "---",
    "name: x",
    "---",
    "",
    "## 前言",
    "角色设定:你是一位资深顾问。",
    "全局约束:绝不编造。",
    "",
    "<!-- skill:review -->",
    "## 审阅小节",
    "只输出 JSON。",
    "<!-- /skill:review -->",
    "",
    "<!-- skill:rewrite -->",
    "## 改写小节",
    "after 写完整内容。",
    "<!-- /skill:rewrite -->",
  ].join("\n");

  it("抽出具名小节", () => {
    writeSkill(tmp!, "resume-optimizer", BODY);
    const part = loadSkillSection("resume-optimizer", "review");
    expect(part).toContain("审阅小节");
    expect(part).toContain("只输出 JSON");
    expect(part).not.toContain("改写小节");
  });

  it("小节前面带着前言 —— 角色设定不能丢", () => {
    writeSkill(tmp!, "resume-optimizer", BODY);
    const part = loadSkillSection("resume-optimizer", "review")!;
    expect(part).toContain("资深顾问");
    expect(part).toContain("绝不编造");
    // 前言在前,小节在后
    expect(part.indexOf("资深顾问")).toBeLessThan(part.indexOf("审阅小节"));
  });

  it("小节不存在时回退到整份正文", () => {
    writeSkill(tmp!, "resume-optimizer", BODY);
    const part = loadSkillSection("resume-optimizer", "不存在的段");
    expect(part).toContain("审阅小节");
    expect(part).toContain("改写小节");
  });

  it("读不到 skill 时返回 null", () => {
    expect(loadSkillSection("resume-optimizer", "review")).toBeNull();
  });
});

describe("仓库里真实存在的 skill", () => {
  it("resume-optimizer 与 resume-interview 都在,且各带自己的小节", () => {
    // 这两条锁住「skill 文件不能被改名/删掉」—— 缺了它们模型路径会静默退回本地引擎
    delete process.env.SKILL_DIR;
    clearSkillCache();

    expect(hasSkill("resume-optimizer")).toBe(true);
    expect(hasSkill("resume-interview")).toBe(true);

    const review = loadSkillSection("resume-optimizer", "review")!;
    expect(review).toContain("severity");
    expect(review).toContain("target");

    const rewrite = loadSkillSection("resume-optimizer", "rewrite")!;
    expect(rewrite).toContain("edits");

    const questions = loadSkillSection("resume-interview", "questions")!;
    expect(questions).toContain("12");
    expect(questions).toContain("topic");

    const answers = loadSkillSection("resume-interview", "answers")!;
    expect(answers).toContain("index");
  });
});
