/**
 * 条目清洗:引导标签行与列表编号前缀。
 *
 * 实测踩过的坑:PDF 抽出来的条目第一行常常是"时间:"这种纯标签,
 * 它不以句号结尾,于是被 findTitleLine 当成公司名 —— 导入后工作经历里
 * 出现 company="时间:"、position 为空的条目。证书同理会带上"1、"前缀。
 */
import { describe, it, expect } from "vitest";
import { resumeFromText } from "./from-text";

const RESUME = `
张伟
前端开发工程师
邮箱:zhangwei@example.com

工作经历
时间：
2024-07 — 2026-04
广州市昌本恒网络科技有限公司
技术部 AI 应用工程师
负责技术支持 AI 助手与日志解析规则生成助手的研发与落地，日常跟进线上运行状态。

证书
1、 信创认证系统架构师
2、CKA 认证
`;

describe("引导标签行不再被当成标题", () => {
  it("「时间：」不会被填进公司名", () => {
    const { data } = resumeFromText(RESUME);
    expect(data.work).toHaveLength(1);
    expect(data.work[0].company).not.toBe("时间：");
    expect(data.work[0].company).toContain("广州市昌本恒网络科技有限公司");
  });

  it("「时间：」不会出现在描述里", () => {
    const { data } = resumeFromText(RESUME);
    expect(data.work[0].description).not.toContain("时间：");
  });

  it("公司名和职位仍能被正确切分", () => {
    const { data } = resumeFromText(RESUME);
    expect(data.work[0].position).toContain("AI 应用工程师");
  });
});

describe("证书编号前缀被剥离", () => {
  it("去掉「1、」这类列表编号", () => {
    const { data } = resumeFromText(RESUME);
    const names = data.certificates.map((c) => c.name);
    expect(names).toContain("信创认证系统架构师");
    expect(names).toContain("CKA 认证");
    expect(names.some((n) => /^\d+[.、)）]/.test(n))).toBe(false);
  });
});
