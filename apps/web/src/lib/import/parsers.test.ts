/**
 * 格式解析器测试:HTML→文本、Markdown、文件调度与错误分支。
 * PDF / DOCX 的真实二进制解析放在浏览器端到端里验证,
 * 这里只覆盖纯函数部分和调度契约。
 */
import { describe, it, expect } from "vitest";
import { htmlToText } from "./html-to-text";
import { markdownToText } from "./parse-markdown";
import {
  parseResumeFile,
  detectFormat,
  ImportError,
  looksLikeScannedText,
  MAX_IMPORT_BYTES,
} from "./parse-file";
import { resumeFromText } from "./from-text";

describe("htmlToText", () => {
  it("块级标签转成换行", () => {
    expect(htmlToText("<p>第一行</p><p>第二行</p>")).toBe("第一行\n第二行");
  });

  it("<br> 转成换行", () => {
    expect(htmlToText("上<br>下")).toBe("上\n下");
  });

  it("表格单元格用 Tab 分隔", () => {
    const html =
      "<table><tr><td>2020.07</td><td>字节跳动</td><td>高级前端工程师</td></tr>" +
      "<tr><td>2018.07</td><td>美团</td><td>前端开发工程师</td></tr></table>";
    expect(htmlToText(html)).toBe(
      "2020.07\t字节跳动\t高级前端工程师\n2018.07\t美团\t前端开发工程师",
    );
  });

  it("列表项加 - 前缀", () => {
    expect(htmlToText("<ul><li>负责 A</li><li>负责 B</li></ul>")).toBe("- 负责 A\n- 负责 B");
  });

  it("解码实体", () => {
    expect(htmlToText("<p>a &amp; b &lt;c&gt; &#65; &#x4E2D;</p>")).toBe("a & b <c> A 中");
  });

  it("剥掉 script/style/注释", () => {
    const html = "<style>p{color:red}</style><script>var x=1;</script><!--备注--><p>正文</p>";
    expect(htmlToText(html)).toBe("正文");
  });

  it("保留标题层级换行结构", () => {
    expect(htmlToText("<h1>工作经历</h1><h2>字节跳动</h2>")).toBe("工作经历\n字节跳动");
  });

  it("空输入返回空串", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("   \n  ")).toBe("");
  });
});

describe("markdownToText", () => {
  it("标题与列表转成可识别章节", () => {
    const md = [
      "# 张伟",
      "",
      "前端工程师 | zhangwei@example.com | 13812345678",
      "",
      "## 工作经历",
      "",
      "### 字节跳动 | 高级前端工程师 | 2020.07 - 至今",
      "",
      "- 负责创作者中心重构",
      "- 主导 SSR 迁移到 Next.js",
      "",
      "## 教育背景",
      "",
      "北京大学 计算机科学与技术 本科 2014.09 - 2018.06",
      "",
      "## 专业技能",
      "",
      "- 精通 TypeScript、React",
      "",
    ].join("\n");
    const text = markdownToText(md);
    expect(text).toContain("工作经历");
    expect(text).toContain("教育背景");
    expect(text).toContain("专业技能");
  });

  it("端到端能喂进 resumeFromText", () => {
    const md = [
      "# 李四",
      "",
      "后端工程师 | li@example.com | 13900001111",
      "",
      "## 工作经历",
      "",
      "### 阿里巴巴 | 后端开发工程师 | 2019.03 - 至今",
      "",
      "- 负责订单系统重构",
      "",
    ].join("\n");
    const { data } = resumeFromText(markdownToText(md));
    expect(data.basics.name).toBe("李四");
    expect(data.basics.email).toBe("li@example.com");
    expect(data.work).toHaveLength(1);
    expect(data.work[0].company).toBe("阿里巴巴");
    expect(data.work[0].position).toBe("后端开发工程师");
    expect(data.work[0].period.current).toBe(true);
    expect(data.work[0].description).toContain("订单系统重构");
  });

  it("表格简历也能解析(表头不能被当成一条经历)", () => {
    const md = [
      "# 王五",
      "",
      "前端工程师 | wangwu@example.com",
      "",
      "## 工作经历",
      "",
      "| 时间 | 公司 | 职位 |",
      "| --- | --- | --- |",
      "| 2021.01 - 2023.06 | 腾讯 | 前端开发工程师 |",
      "",
    ].join("\n");
    const { data } = resumeFromText(markdownToText(md));
    expect(data.work).toHaveLength(1);
    expect(data.work[0].company).toBe("腾讯");
  });

  it("剥掉 YAML front matter", () => {
    const md = ["---", "name: 赵六", "---", "", "# 赵六", "", "前端工程师 | zhaoliu@example.com", ""].join("\n");
    const text = markdownToText(md);
    expect(text.startsWith("---")).toBe(false);
    expect(text).toContain("赵六");
  });

  it("空输入不崩", () => {
    expect(markdownToText("")).toBe("");
  });
});

describe("detectFormat", () => {
  it("按扩展名识别", () => {
    expect(detectFormat("a.pdf", "application/pdf")).toBe("pdf");
    expect(
      detectFormat("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
    expect(detectFormat("a.md", "text/markdown")).toBe("markdown");
    expect(detectFormat("a.markdown", "")).toBe("markdown");
    expect(detectFormat("a.txt", "text/plain")).toBe("txt");
  });

  it("识别旧版 .doc", () => {
    expect(detectFormat("a.doc", "application/msword")).toBe("doc");
  });

  it("无法识别返回 null", () => {
    expect(detectFormat("a.exe", "application/octet-stream")).toBeNull();
    expect(detectFormat("", "")).toBeNull();
  });
});

describe("looksLikeScannedText", () => {
  it("空文本判为扫描件", () => {
    expect(looksLikeScannedText("", 3)).toBe(true);
    expect(looksLikeScannedText("   \n\n  ", 3)).toBe(true);
  });

  it("每页平均字数过少判为扫描件", () => {
    // 3 页一共只抽出 20 个字 -> 平均 6.7 字/页,几乎不可能是真文本
    expect(looksLikeScannedText("x".repeat(20), 3)).toBe(true);
  });

  it("正常文本不判为扫描件", () => {
    expect(looksLikeScannedText("工作经历 字节跳动 高级前端工程师".repeat(5), 2)).toBe(false);
  });
});

describe("parseResumeFile — 调度与错误分支", () => {
  function makeFile(name: string, type: string, content: string | Uint8Array<ArrayBuffer>): File {
    return new File([content], name, { type });
  }

  it("解析 .md", async () => {
    const file = makeFile("r.md", "text/markdown", "# 张伟\n\n前端工程师\n");
    const r = await parseResumeFile(file);
    expect(r.format).toBe("markdown");
    expect(r.text).toContain("张伟");
  });

  it("解析 .txt", async () => {
    const file = makeFile("r.txt", "text/plain", "张伟\n13812345678\nzhangwei@example.com");
    const r = await parseResumeFile(file);
    expect(r.format).toBe("txt");
    expect(r.text).toContain("13812345678");
  });

  it("拒绝不支持的类型并给出可读原因", async () => {
    const file = makeFile("a.exe", "application/octet-stream", new Uint8Array([1, 2, 3]));
    await expect(parseResumeFile(file)).rejects.toThrow(ImportError);
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("unsupported-type");
      expect(e.hint).toContain("PDF");
    });
  });

  it(".doc 旧格式给出明确提示而不是静默失败", async () => {
    // OLE2 复合文档头
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const file = makeFile("old.doc", "application/msword", ole2);
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("legacy-doc");
      expect(e.hint).toContain(".docx");
    });
  });

  it("扩展名说 docx 但内容其实是 doc 时也报错", async () => {
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const file = makeFile("fake.docx", "", ole2);
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("legacy-doc");
    });
  });

  it("空内容给出 empty-text 而不是解析失败", async () => {
    const file = makeFile("empty.md", "text/markdown", "   \n\n  ");
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("empty-text");
    });
  });

  it("超大文件直接拒绝,不做解析", async () => {
    const file = makeFile("big.md", "text/markdown", "x".repeat(10));
    Object.defineProperty(file, "size", { value: MAX_IMPORT_BYTES + 1 });
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("too-large");
    });
  });

  it("损坏的 docx 不抛裸异常", async () => {
    const garbage = new Uint8Array(64).fill(7);
    const file = makeFile("broken.docx", "", garbage);
    await parseResumeFile(file).catch((e: ImportError) => {
      expect(e.code).toBe("parse-failed");
    });
  });
});