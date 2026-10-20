/**
 * PDF 生成 smoke tests.
 *
 * 用 pdf-lib 解析生成结果,验证:
 *  - magic header "%PDF-"
 *  - 至少 1 页
 *  - 文件大小合理(>5KB,<2MB)
 *  - 标题 metadata 反映 resume.basics.name
 *  - 中文字符能落到 content stream 中(粗略验证:buffer 含中文字节)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderToBuffer } from "@react-pdf/renderer";
// 测试在 Node 顶层可以直接 import,不像 Next RSC
import { ResumeDocument } from "./documents";
import type { ResumeData } from "@/lib/validation/resume";
import { registerFontsOnce } from "./font";

const sampleData: ResumeData = {
  basics: {
    name: "张三",
    label: "高级前端工程师",
    email: "zhang@example.com",
    phone: "13800138000",
    gender: "male",
    location: "上海",
    avatar: "",
    summary: "5 年 React / Next.js 经验",
  },
  summary: "<p>8 年互联网产品经验,主导过千万级 DAU 项目重构。</p>",
  education: [
    {
      id: "e1",
      school: "清华大学",
      degree: "本科",
      major: "计算机科学与技术",
      period: { start: "2014-09", end: "2018-06", current: false },
      description: "<p>GPA 3.8, ACM 校队</p>",
    },
  ],
  work: [
    {
      id: "w1",
      company: "字节跳动",
      position: "高级前端工程师",
      period: { start: "2020-07", end: "", current: true },
      description:
        "<ul><li>主导抖音创作者中心重构</li><li>推动 SSR 框架迁移到 Next.js</li><li>团队 <b>10 人</b></li></ul>",
    },
  ],
  projects: [
    {
      id: "p1",
      name: "简历生成器",
      role: "前端负责人",
      period: { start: "2023-01", end: "", current: true },
      url: "https://example.com",
      description: "<p>开源简历 SaaS</p>",
    },
  ],
  skills: [
    { id: "s1", name: "TypeScript", level: "expert" },
    { id: "s2", name: "React", level: "expert" },
    { id: "s3", name: "Node.js", level: "advanced" },
  ],
  languages: [
    { id: "l1", name: "英语", level: "C1" },
    { id: "l2", name: "日语", level: "B2" },
  ],
  awards: [
    { id: "a1", title: "字节跳动优秀员工", awarder: "字节", date: "2022", description: "" },
  ],
  certificates: [
    { id: "c1", name: "AWS Solutions Architect", issuer: "Amazon", date: "2024" },
  ],
  interests: "阅读 / 跑步 / 桌游",
};

async function generate(data: ResumeData, template: "classic" | "modern" | "minimal"): Promise<Buffer> {
  await registerFontsOnce();
  return renderToBuffer(ResumeDocument({ data, template }));
}

/**
 * 用 pdfjs 反查 PDF 里的实际文字。
 * 不能用 UTF-16BE 字节搜索 —— react-pdf 子集化字体走 Identity-H + CMap,
 * content stream 里是字形 ID,不是 Unicode。要验证中文是否真的渲染出来,
 * 必须走 pdfjs 的 CMap 解码。
 */
async function extractText(buf: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  let all = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    all += tc.items.map((it: any) => it.str).join("") + "\n";
  }
  return all;
}

describe("ResumeDocument — PDF generation", () => {
  beforeAll(async () => {
    await registerFontsOnce();
  });

  it("produces a valid PDF for classic template", async () => {
    const buf = await generate(sampleData, "classic");
    expect(buf.length).toBeGreaterThan(5_000);
    expect(buf.length).toBeLessThan(5_000_000); // 5MB 上限,MVP 目标 < 1MB
    // magic header
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    // pdf-lib 能解析
    const doc = await PDFDocument.load(buf);
    expect(doc.getPages().length).toBeGreaterThanOrEqual(1);
  });

  it("produces a valid PDF for modern template", async () => {
    const buf = await generate(sampleData, "modern");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(buf);
    expect(doc.getPages().length).toBeGreaterThanOrEqual(1);
  });

  it("produces a valid PDF for minimal template", async () => {
    const buf = await generate(sampleData, "minimal");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(buf);
    expect(doc.getPages().length).toBeGreaterThanOrEqual(1);
  });

  it("Title metadata reflects candidate name", async () => {
    const buf = await generate(sampleData, "modern");
    const doc = await PDFDocument.load(buf);
    expect(doc.getTitle()).toBe("张三");
  });

  it("renders Chinese text correctly (verified via pdfjs CMap decode)", async () => {
    const buf = await generate(sampleData, "modern");
    const text = await extractText(buf);
    // 真实可读的中文 —— 不只是字节存在,而是能反查出来
    expect(text).toContain("张三");
    expect(text).toContain("高级前端工程师");
    expect(text).toContain("字节跳动");
    expect(text).toContain("清华大学");
    expect(text).toContain("主导抖音创作者中心重构");
    expect(text).toContain("阅读");
  });

  it("renders contact fields with text labels, not missing-glyph boxes", async () => {
    const buf = await generate(sampleData, "modern");
    const text = await extractText(buf);
    // 回归:曾用 emoji ✉📞📍,Noto Sans SC 缺字形 → PDF 里显示成乱码
    expect(text).toContain("邮箱 zhang@example.com");
    expect(text).toContain("电话 13800138000");
    expect(text).toContain("所在地 上海");
    // 不应残留 emoji 或 .notdef 替换符
    expect(text).not.toContain("✉");
    expect(text).not.toContain("📞");
    expect(text).not.toContain("📍");
    expect(text).not.toMatch(/[=\uFFF0-\uFFFF]/);
  });

  it("empty resume renders without crashing", async () => {
    const empty: ResumeData = {
      basics: { name: "", label: "", email: "", phone: "", gender: "", location: "", avatar: "", summary: "" },
      summary: "",
      education: [],
      work: [],
      projects: [],
      skills: [],
      languages: [],
      awards: [],
      certificates: [],
      interests: "",
    };
    const buf = await generate(empty, "minimal");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rich HTML bullet list parses to PDF", async () => {
    const data: ResumeData = {
      ...sampleData,
      work: [
        {
          id: "w1",
          company: "字节跳动",
          position: "",
          period: { start: "2020", end: "", current: true },
          description: "<ul><li>第一项 <b>加粗</b></li><li>第二项 <em>斜体</em></li></ul>",
        },
      ],
    };
    const buf = await generate(data, "classic");
    expect(buf.length).toBeGreaterThan(5_000);
    const text = await extractText(buf);
    expect(text).toContain("字节跳动");
    expect(text).toContain("第一项");
    expect(text).toContain("第二项");
  });
});