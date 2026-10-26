/**
 * PDF/Word 抽取出来的文本带有"排版换行"——一句话会被版心宽度切成多行,
 * 甚至在英文单词中间断开(embedding- / v3)。这些换行不是语义换行,
 * 直接当条目会让一段经历碎成几十个 bullet。
 *
 * 这些用例取自真实简历抽取结果(已匿名化),验证能把排版换行还原回去。
 */
import { describe, it, expect } from "vitest";
import { mergeWrappedLines } from "./extract";
import { resumeFromText } from "./from-text";

describe("mergeWrappedLines", () => {
  it("上一行没有句末标点时视为排版换行并合并", () => {
    expect(
      mergeWrappedLines([
        "2. 支持负责人反馈重复性配置与报错咨询减少约一半，新人独立处理常见客户问题的周期从两个多月缩",
        "短到一个月左右。",
      ]),
    ).toEqual([
      "2. 支持负责人反馈重复性配置与报错咨询减少约一半，新人独立处理常见客户问题的周期从两个多月缩短到一个月左右。",
    ]);
  });

  it("上一行以句末标点结尾时保留换行", () => {
    expect(
      mergeWrappedLines([
        "1. 助手在技术支持团队的日常使用中稳定运行，检索准确率明显提升。",
        "2. 支持负责人反馈重复性配置减少约一半。",
      ]),
    ).toHaveLength(2);
  });

  it("顿号结尾表示列表未结束,继续合并", () => {
    expect(
      mergeWrappedLines([
        "技术栈：Python、FastAPI、LangChain、Celery、",
        "SSE、Langfuse、RAGAS",
      ]),
    ).toEqual(["技术栈：Python、FastAPI、LangChain、Celery、SSE、Langfuse、RAGAS"]);
  });

  it("带冒号的引导标签另起一条", () => {
    expect(
      mergeWrappedLines([
        "SSE、Langfuse、RAGAS",
        "项目背景：公司代理交付 WAF、日志审计。",
      ]),
    ).toHaveLength(2);
  });

  it("职位抬头行不被当成半句话吞进描述", () => {
    expect(
      mergeWrappedLines([
        "技术部 AI 应用工程师 广州",
        "负责技术支持 AI 助手的研发与落地。",
      ]),
    ).toHaveLength(2);
  });

  it("英文连字符断行保留连字符且不插空格", () => {
    expect(mergeWrappedLines(["模型：DeepSeek-", "Embedding-V3、DashScope qwen3"])).toEqual([
      "模型：DeepSeek-Embedding-V3、DashScope qwen3",
    ]);
  });

  it("bullet 开头的行视为新条目,不合并", () => {
    expect(
      mergeWrappedLines(["上一条描述没有句号", "• 新的条目内容"]),
    ).toHaveLength(2);
  });

  it("编号开头的行视为新条目,不合并", () => {
    expect(
      mergeWrappedLines([
        "1. 实现文档入库与目录树构建，先做标题层级过滤和目录噪音",
        "2. 实现规格类文档切分。",
      ]),
    ).toHaveLength(2);
  });

  it("含时间区间的行视为新条目,不合并", () => {
    expect(
      mergeWrappedLines(["2020-09 — 2024-06  广东技术师范大学", "通信工程  本科"]),
    ).toHaveLength(2);
  });

  it("空行既不占条目也不阻断合并", () => {
    expect(mergeWrappedLines(["内容一", "", "   ", "内容二。"])).toEqual(["内容一内容二。"]);
  });
});

describe("resumeFromText 排版换行还原", () => {
  const WRAPPED = `
张伟
前端开发工程师
手机:13812345678
邮箱:zhangwei@example.com

工作经历
2025-11 — 2026-04  某科技有限公司
AI 应用工程师
2. 支持负责人反馈重复性配置与报错咨询减少约一半，新人独立处理常见客户问
题的周期从两个多月缩短到一个月左右。
3. 语义缓存命中的高频问题从数秒级响应降到毫秒级直出，缓存命中率稳定在 25%
左右。

个人简介
1. 具备 AI 应用开发与工程落地能力，完成安全产品支持 AI 助手两个项目，覆
盖 RAG 全链路、Agentic 检索决策与自动验证闭环。
2. 熟练掌握 Vibe Coding 开发模式，测试先行。
`;

  it("工作经历描述不再碎成多条 bullet", () => {
    const { data } = resumeFromText(WRAPPED);
    const li = data.work[0]?.description.match(/<li>([\s\S]*?)<\/li>/g) ?? [];
    expect(data.work).toHaveLength(1);
    // 「2.」和「3.」各一条,不再被排版换行切碎
    expect(li).toHaveLength(3);
    expect(data.work[0].description).toContain("两个多月缩短到一个月左右。");
    expect(data.work[0].description).toContain("稳定在 25%左右。");
  });

  it("个人简介保留编号分段,但句中换行被合并", () => {
    const { data } = resumeFromText(WRAPPED);
    expect(data.summary).not.toContain("覆\n");
    expect(data.summary).toContain("覆盖 RAG 全链路");
    // 两条编号之间是真实分段,换行要留着
    expect(data.summary).toContain("\n2.");
  });
});
