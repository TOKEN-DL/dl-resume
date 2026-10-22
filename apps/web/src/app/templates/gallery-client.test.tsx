import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GalleryClient } from "./gallery-client";
import { TEMPLATES, STYLE_GROUPS } from "@/lib/templates";

// App Router 的 router context 只在真实应用树里存在,静态渲染时用桩代替
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("GalleryClient", () => {
  it("渲染出全部 32 套模板的名字", () => {
    const html = renderToStaticMarkup(<GalleryClient />);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(80);
    for (const t of TEMPLATES) {
      expect(html, t.id).toContain(t.name);
    }
  });

  it("渲染出全部风格组 Tab 文案", () => {
    const html = renderToStaticMarkup(<GalleryClient />);
    expect(html).toContain("全部");
    for (const g of STYLE_GROUPS) {
      expect(html, g.key).toContain(g.label);
    }
    expect(html).toContain("极简黑白");
    expect(html).toContain("学术稳重");
  });

  it("渲染出筛选相关的文案(搜索框 / 场景 / 岗位 / 选择按钮)", () => {
    const html = renderToStaticMarkup(<GalleryClient />);
    expect(html).toContain("搜索模板名或风格描述");
    expect(html).toContain("风格");
    expect(html).toContain("场景");
    expect(html).toContain("岗位");
    expect(html).toContain("通用");
    expect(html).toContain("前端");
    expect(html).toContain("使用此模板");
  });
});
