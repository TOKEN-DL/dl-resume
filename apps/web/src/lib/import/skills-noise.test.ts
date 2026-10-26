/**
 * 技能抽取的噪声治理。
 *
 * 实测踩过的坑:简历里写"熟练掌握 FastAPI 异步服务开发,能构建分层评测集…",
 * 触发词"熟练"后面跟着空格就能命中,于是整行说明句被按标点切成技能名,
 * 产出「FastAPI 异步服务开发」「能构建分层评测集量化检索召回与答案质量」
 * 这种把半句话当技能的结果。这里锁定期望行为。
 */
import { describe, it, expect } from "vitest";
import { extractSkills } from "./extract";

const names = (lines: string[]) => extractSkills(lines).map((s) => s.name);

describe("extractSkills 噪声治理", () => {
  it("不把「熟练掌握 XX 开发」这类说明句切成技能名", () => {
    const got = names([
      "熟练掌握 FastAPI 异步服务开发，能构建分层评测集量化检索召回与答案质量",
    ]);
    expect(got).not.toContain("FastAPI 异步服务开发");
    expect(got).not.toContain("能构建分层评测集量化检索召回与答案质量");
    // 词典命中的 FastAPI 仍然要留下
    expect(got).toContain("FastAPI");
  });

  it("含空格的片段若一侧是中文,判为句子而非技能名", () => {
    const got = names(["技术栈：Python、RAG 全链路、Spring Boot"]);
    expect(got).toContain("Spring Boot"); // 两侧都是英文,合法
    expect(got).not.toContain("RAG 全链路"); // 中文描述,不是技能名
  });

  it("不以动词开头的片段一律丢弃", () => {
    const got = names(["掌握：能构建评估集、负责交付、具备沟通能力、Python"]);
    expect(got).not.toContain("能构建评估集");
    expect(got).not.toContain("负责交付");
    expect(got).not.toContain("具备沟通能力");
    expect(got).toContain("Python");
  });

  it("单字符片段不作为技能名", () => {
    const got = names(["技能：具、通、Docker"]);
    expect(got).not.toContain("具");
    expect(got).not.toContain("通");
    expect(got).toContain("Docker");
  });

  it("仍然认得纯英文技术栈写法", () => {
    const got = names(["技术栈：Python、FastAPI、LangChain、Redis"]);
    expect(got).toEqual(expect.arrayContaining(["Python", "FastAPI", "LangChain", "Redis"]));
  });

  it("仍然认得没有冒号的中文分列写法", () => {
    const got = names(["精通 Python、FastAPI、LangChain"]);
    expect(got).toEqual(expect.arrayContaining(["Python", "FastAPI", "LangChain"]));
  });

  it("去重,同名技能只出现一次", () => {
    const got = names(["技能：Python、Python、Docker"]);
    expect(got.filter((n) => n === "Python")).toHaveLength(1);
  });
});
