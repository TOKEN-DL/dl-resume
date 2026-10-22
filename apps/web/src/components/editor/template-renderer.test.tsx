import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateRenderer } from "./template-renderer";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { SAMPLE_PROFESSIONAL } from "@/lib/templates/samples";
import { EMPTY_RESUME_DATA } from "@/lib/validation/resume";

describe("TemplateRenderer", () => {
  it("全部模板都能渲染出范文里的姓名", () => {
    for (const def of TEMPLATES) {
      const html = renderToStaticMarkup(
        <TemplateRenderer def={def} data={SAMPLE_PROFESSIONAL} />,
      );
      expect(html, def.id).toContain("陈默");
      expect(html, def.id).toContain("星云科技");
    }
  });

  it("根元素带 data-tpl,便于专属装饰层定位", () => {
    const html = renderToStaticMarkup(
      <TemplateRenderer def={getTemplate("fresh-mint")} data={SAMPLE_PROFESSIONAL} />,
    );
    expect(html).toContain('data-tpl="fresh-mint"');
  });

  it("主题 token 注入为 CSS 变量", () => {
    const def = getTemplate("modern");
    const html = renderToStaticMarkup(
      <TemplateRenderer def={def} data={SAMPLE_PROFESSIONAL} />,
    );
    expect(html).toContain("--accent");
    expect(html).toContain(def.theme.accent);
    expect(html).toContain(def.theme.ink);
  });

  it("空数据不报错,并给出占位姓名", () => {
    for (const def of TEMPLATES) {
      const html = renderToStaticMarkup(
        <TemplateRenderer def={def} data={EMPTY_RESUME_DATA} />,
      );
      expect(html, def.id).toContain("未填写姓名");
    }
  });

  it("七种骨架都能渲染出内容", () => {
    const layouts = new Set(TEMPLATES.map((t) => t.layout));
    expect(layouts.size).toBe(7);
    for (const def of TEMPLATES) {
      const html = renderToStaticMarkup(
        <TemplateRenderer def={def} data={SAMPLE_PROFESSIONAL} />,
      );
      expect(html, def.id).toContain("工作经历");
      expect(html, def.id).toContain("教育背景");
    }
  });

  it("侧栏骨架把联系方式放进侧栏", () => {
    const html = renderToStaticMarkup(
      <TemplateRenderer def={getTemplate("navy-elegant")} data={SAMPLE_PROFESSIONAL} />,
    );
    expect(html).toContain("邮箱 chenmo@example.com");
  });

  it("HTML 输出里不含 script 标签", () => {
    const dirty = {
      ...SAMPLE_PROFESSIONAL,
      summary: '<p>安全<script>alert(1)</script></p>',
    };
    const html = renderToStaticMarkup(
      <TemplateRenderer def={getTemplate("classic")} data={dirty} />,
    );
    expect(html).not.toContain("<script");
  });
});
