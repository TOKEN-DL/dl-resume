// @vitest-environment jsdom
/**
 * TemplateThumb —— 缩略图组件。
 *
 * 盯两件事:
 *   1. 传了 data 就渲染这份内容,不传才用模板自带的范文
 *   2. lazy=false 时立刻挂载真实 A4(lazy=true 则等进视口)
 *
 * 注意缩放比例是量容器宽度算出来的(jsdom 里 clientWidth 恒为 0),
 * 所以这里要把 clientWidth 桩成真实值,否则永远只出占位骨架。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, cleanup } from "@testing-library/react";
import { TemplateThumb } from "./template-thumb";
import { getTemplate } from "@/lib/templates";
import { EMPTY_RESUME_DATA, type ResumeData } from "@/lib/validation/resume";

const def = getTemplate("classic");
const CARD_WIDTH = 282;

/** 造一份内容明显不同的简历,用来确认渲染的是它而不是范文 */
const custom: ResumeData = {
  ...EMPTY_RESUME_DATA,
  basics: {
    ...EMPTY_RESUME_DATA.basics,
    name: "张三丰",
    email: "zhang@example.com",
    label: "武林至尊",
  },
};

beforeAll(() => {
  // jsdom 没有布局,clientWidth 恒为 0 —— 桩成真实卡片宽度
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return CARD_WIDTH;
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("TemplateThumb", () => {
  it("SSR 时先出占位骨架(容器保持 A4 比例,网格不跳动)", () => {
    const html = renderToStaticMarkup(<TemplateThumb def={def} data={custom} />);
    // 服务端没有布局,量不到宽度 → 只出等高占位
    expect(html).not.toContain("张三丰");
    expect(html).toContain("thumbPlaceholder");
  });

  it("传了 data 就渲染这份内容,而不是范文", () => {
    render(<TemplateThumb def={def} data={custom} lazy={false} />);
    expect(screen.getByText("张三丰")).toBeTruthy();
    expect(screen.getByText("武林至尊")).toBeTruthy();
    expect(screen.queryByText("陈默")).toBeNull();
  });

  it("不传 data 时渲染模板自带的范文", () => {
    render(<TemplateThumb def={def} lazy={false} />);
    expect(screen.getByText("陈默")).toBeTruthy();
  });

  it("用的是这份简历自己的模板(根元素带 data-tpl)", () => {
    const { container } = render(
      <TemplateThumb def={getTemplate("navy-elegant")} data={custom} lazy={false} />,
    );
    expect(container.querySelector('[data-tpl="navy-elegant"]')).toBeTruthy();
  });

  it("真实 A4 被缩放到卡片宽度(scale = width / 794)", () => {
    const { container } = render(
      <TemplateThumb def={def} data={custom} lazy={false} />,
    );
    const scaler = container.querySelector("[class*=thumbScaler]") as HTMLElement;
    expect(scaler).toBeTruthy();
    expect(scaler.style.transform).toBe(`scale(${CARD_WIDTH / 794})`);
  });
});
