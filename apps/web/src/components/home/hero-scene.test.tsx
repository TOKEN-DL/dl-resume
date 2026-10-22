/**
 * HeroScene —— 首页 3D 场景。
 *
 * 盯三件事:
 *   1. 场景里的卡片是**真实模板渲染**(根元素带 data-tpl),不是假缩略图
 *   2. 每张卡在 3D 空间里的位置互不相同(coverflow 真的排开了)
 *   3. 底部圆点与模板一一对应,当前项有 aria-current
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroScene } from "./hero-scene";
import { getTemplate } from "@/lib/templates";

const IDS = ["classic", "modern", "navy-elegant", "blue-corporate", "timeline-style"];
const DEFS = IDS.map((id) => getTemplate(id));

describe("HeroScene", () => {
  it("渲染出与模板数量相同的卡片", () => {
    const html = renderToStaticMarkup(<HeroScene templates={DEFS} />);
    const cards = html.match(/data-scene-card="/g) ?? [];
    expect(cards.length).toBe(IDS.length);
    for (const id of IDS) {
      expect(html, id).toContain(`data-scene-card="${id}"`);
    }
  });

  it("卡片里是真实模板渲染(带 data-tpl 的 A4)", () => {
    const html = renderToStaticMarkup(<HeroScene templates={DEFS} />);
    for (const id of IDS) {
      expect(html, id).toContain(`data-tpl="${id}"`);
    }
    // 真实范文的名字应该出现在画面里
    expect(html).toContain("陈默");
  });

  it("每张卡的 3D 变换都不同(真的排开了,不是叠在一起)", () => {
    const html = renderToStaticMarkup(<HeroScene templates={DEFS} />);
    // 只取卡片的变换(漂浮标签用的是另一种 translate3d 写法)
    const transforms = [
      ...html.matchAll(/transform:translate3d\(calc\(var\(--card-gap\)[^;]+/g),
    ].map((m) => m[0]);
    expect(transforms.length).toBe(IDS.length);
    expect(new Set(transforms).size).toBe(IDS.length);
    // 中心卡不旋转,两侧卡带 rotateY
    expect(html).toContain("rotateY(0deg)");
    expect(html).toContain("rotateY(30deg)");
    expect(html).toContain("rotateY(-30deg)");
  });

  it("底部圆点与模板一一对应,且当前项带 aria-current", () => {
    const html = renderToStaticMarkup(<HeroScene templates={DEFS} />);
    const dots = html.match(/aria-label="/g) ?? [];
    expect(dots.length).toBe(IDS.length);
    expect(html).toContain('aria-current="true"');
    // 说明区展示当前模板的名字
    expect(html).toContain("经典商务");
  });

  it("没有模板时整块不渲染", () => {
    const html = renderToStaticMarkup(<HeroScene templates={[]} />);
    expect(html).toBe("");
  });
});
