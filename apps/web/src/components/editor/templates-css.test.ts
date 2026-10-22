import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES } from "@/lib/templates";

/**
 * 装饰层完整性 —— 保证「注册表里有的模板,就有专属装饰」,
 * 且装饰里引用的类名都是骨架里真实存在的。
 *
 * 装饰层用 `[data-tpl="<id>"]` 属性选择器写在同一个 CSS Module 里,
 * 跨 CSS Module 引用不到对方的哈希类名,所以拼错类名不会报错、
 * 只会静默失效 —— 这个测试就是用来堵这个洞的。
 */

const CSS_PATH = join(process.cwd(), "src", "components", "editor", "templates.module.css");
/** 去掉注释后再扫描,免得注释里的示例 id 混进来 */
const css = readFileSync(CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** 骨架里定义过的类名(选择器出现在规则开头) */
const definedClasses = new Set(
  [...css.matchAll(/(?:^|[{};])\s*\.([A-Za-z][\w-]*)/g)].map((m) => m[1]),
);

/** 装饰层里引用到的类名 */
const usedClasses = [...css.matchAll(/\[data-tpl="[^"]+"\]\s+\.([A-Za-z][\w-]*)/g)].map(
  (m) => m[1],
);

describe("模板装饰层", () => {
  it("每套模板都有专属装饰块", () => {
    const missing = TEMPLATES.filter((t) => !css.includes(`[data-tpl="${t.id}"]`)).map(
      (t) => t.id,
    );
    expect(missing, `这些模板没有专属装饰: ${missing.join(", ")}`).toEqual([]);
  });

  it("装饰层引用的类名都在骨架里定义过", () => {
    const missing = [...new Set(usedClasses)].filter((c) => !definedClasses.has(c));
    expect(missing, `装饰层引用了不存在的类名: ${missing.join(", ")}`).toEqual([]);
  });

  it("装饰层不残留旧的模板 id(删模板时要一起清装饰)", () => {
    const ids = [...css.matchAll(/\[data-tpl="([^"]+)"\]/g)].map((m) => m[1]);
    const known = new Set(TEMPLATES.map((t) => t.id));
    const orphans = [...new Set(ids)].filter((id) => !known.has(id));
    expect(orphans, `装饰层里有孤儿 id: ${orphans.join(", ")}`).toEqual([]);
  });

  it("新增批次的装饰手法不重样(每套的专属规则数 >= 1)", () => {
    const counts = new Map<string, number>();
    for (const m of css.matchAll(/\[data-tpl="([^"]+)"\]/g)) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    const thin = TEMPLATES.filter((t) => (counts.get(t.id) ?? 0) < 1).map((t) => t.id);
    expect(thin, `这些模板装饰规则不足: ${thin.join(", ")}`).toEqual([]);
  });
});
