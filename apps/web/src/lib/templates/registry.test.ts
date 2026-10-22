import { describe, it, expect } from "vitest";
import type { LayoutKind } from "./types";
import {
  TEMPLATES,
  TEMPLATE_IDS,
  getTemplate,
  isTemplateId,
  STYLE_GROUPS,
  SCENE_TAGS,
  ROLE_TAGS,
} from "./registry";
import { ResumeDataSchema } from "@/lib/validation/resume";

describe("template registry", () => {
  it("模板数量不少于 80 套", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(80);
  });

  it("id 唯一且为 kebab-case", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
    for (const id of TEMPLATE_IDS) {
      expect(id, id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it("中文名唯一", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(new Set(names).size, "存在重名模板").toBe(names.length);
  });

  it("新增批次的模板主色互不重复,且不复用首批的主色", () => {
    // 注册表前 32 套是首批(极简黑白 / 商务经典等同色系刻意撞色,
    // 但骨架与标题形态都不同,四元组唯一性已单独断言);
    // 之后追加的批次必须换新主色,保证"越往后越新"的视觉差异。
    const FIRST_BATCH = 32;
    const firstBatch = TEMPLATES.slice(0, FIRST_BATCH);
    const laterBatch = TEMPLATES.slice(FIRST_BATCH);
    expect(laterBatch.length, "新增批次应有 50 套").toBe(50);

    const laterAccents = laterBatch.map((t) => t.theme.accent);
    const dup = laterAccents.filter((a, i) => laterAccents.indexOf(a) !== i);
    expect(dup, `新增批次主色重复: ${[...new Set(dup)].join(", ")}`).toEqual([]);

    const firstAccents = new Set(firstBatch.map((t) => t.theme.accent));
    const reused = laterAccents.filter((a) => firstAccents.has(a));
    expect(reused, `新增批次复用了首批主色: ${[...new Set(reused)].join(", ")}`).toEqual([]);
  });

  it("新增批次的中文名与首批不重复", () => {
    const FIRST_BATCH = 32;
    const firstNames = new Set(TEMPLATES.slice(0, FIRST_BATCH).map((t) => t.name));
    for (const t of TEMPLATES.slice(FIRST_BATCH)) {
      expect(firstNames.has(t.name), `新增模板「${t.name}」与首批重名`).toBe(false);
    }
  });

  it("存量三个模板 id 保留且标记 legacy", () => {
    for (const id of ["classic", "modern", "minimal"]) {
      expect(isTemplateId(id), id).toBe(true);
      expect(getTemplate(id).legacy, id).toBe(true);
    }
    expect(TEMPLATES.filter((t) => t.legacy).length).toBe(3);
  });

  it("任意两套的 骨架+主色+字体+标题形态 四元组不重复", () => {
    const seen = new Set<string>();
    for (const t of TEMPLATES) {
      const key = `${t.layout}|${t.theme.accent}|${t.theme.font}|${t.theme.heading}`;
      expect(seen.has(key), `重复组合: ${key} (${t.id})`).toBe(false);
      seen.add(key);
    }
  });

  it("六元组(骨架+主色+字体+抬头+标题+姓名)也不重复", () => {
    const seen = new Set<string>();
    for (const t of TEMPLATES) {
      const key = [
        t.layout,
        t.theme.accent,
        t.theme.font,
        t.theme.headerStyle,
        t.theme.heading,
        t.theme.nameStyle,
      ].join("|");
      expect(seen.has(key), `重复组合: ${key} (${t.id})`).toBe(false);
      seen.add(key);
    }
  });

  it("七个骨架都被覆盖,且没有骨架一家独大", () => {
    const kinds: LayoutKind[] = [
      "single-classic",
      "single-modern",
      "sidebar-left",
      "sidebar-right",
      "two-column",
      "timeline",
      "card-grid",
    ];
    for (const k of kinds) {
      const n = TEMPLATES.filter((t) => t.layout === k).length;
      expect(n, `骨架 ${k} 只有 ${n} 套`).toBeGreaterThanOrEqual(2);
    }
    // 单一骨架不超过总���的 35%,保证模板库整体不会看着雷同
    for (const k of kinds) {
      const n = TEMPLATES.filter((t) => t.layout === k).length;
      expect(n / TEMPLATES.length, `骨架 ${k} 占比过高`).toBeLessThan(0.35);
    }
  });

  it("每个视觉维度都被充分使用(不是所有模板一个样)", () => {
    const dims: Record<string, number> = {
      font: new Set(TEMPLATES.map((t) => t.theme.font)).size,
      heading: new Set(TEMPLATES.map((t) => t.theme.heading)).size,
      skill: new Set(TEMPLATES.map((t) => t.theme.skill)).size,
      avatar: new Set(TEMPLATES.map((t) => t.theme.avatar)).size,
      nameStyle: new Set(TEMPLATES.map((t) => t.theme.nameStyle)).size,
      headerStyle: new Set(TEMPLATES.map((t) => t.theme.headerStyle)).size,
      group: new Set(TEMPLATES.map((t) => t.group)).size,
    };
    // 黑 / 宋 / 楷三族都要用;标题 10 种、姓名 6 种、抬头 6 种必须全覆盖
    expect(dims.font, "字体维度覆盖不足").toBe(3);
    expect(dims.heading, "标题形态覆盖不足").toBe(10);
    expect(dims.skill, "技能形态覆盖不足").toBe(4);
    expect(dims.avatar, "头像形态覆盖不足").toBe(5);
    expect(dims.nameStyle, "姓名形态覆盖不足").toBe(6);
    expect(dims.headerStyle, "抬头形态覆盖不足").toBe(6);
    expect(dims.group, "风格组覆盖不足").toBe(8);
  });

  it("未知 id 回退到 classic", () => {
    expect(getTemplate("not-exist").id).toBe("classic");
    expect(getTemplate("classic").id).toBe("classic");
    expect(isTemplateId("not-exist")).toBe(false);
  });

  it("每套模板的范文通过 schema 校验", () => {
    for (const t of TEMPLATES) {
      const r = ResumeDataSchema.safeParse(t.sample);
      expect(
        r.success,
        `${t.id} 范文不合法: ${r.success ? "" : JSON.stringify(r.error.issues)}`,
      ).toBe(true);
    }
  });

  it("风格组都在枚举内,且每组至少 3 套", () => {
    const keys = new Set(STYLE_GROUPS.map((g) => g.key));
    for (const t of TEMPLATES) {
      expect(keys.has(t.group), t.id).toBe(true);
    }
    for (const g of STYLE_GROUPS) {
      const n = TEMPLATES.filter((t) => t.group === g.key).length;
      expect(n, `风格组 ${g.label} 只有 ${n} 套`).toBeGreaterThanOrEqual(3);
    }
  });

  it("场景与岗位标签都在枚举内", () => {
    const scenes = new Set(SCENE_TAGS.map((s) => s.key));
    const roles = new Set(ROLE_TAGS.map((r) => r.key));
    for (const t of TEMPLATES) {
      for (const s of t.scenes) expect(scenes.has(s), `${t.id}: ${s}`).toBe(true);
      for (const r of t.roles) expect(roles.has(r), `${t.id}: ${r}`).toBe(true);
      expect(t.scenes.length + t.roles.length, `${t.id} 没有任何标签`).toBeGreaterThan(0);
    }
  });

  it("主题 token 字段完整", () => {
    for (const t of TEMPLATES) {
      const th = t.theme;
      expect(th.accent, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(th.accentSoft, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(th.ink, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(th.muted, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(th.border, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(th.paper, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(["sans", "serif", "kai"], t.id).toContain(th.font);
      expect(th.fontScale, t.id).toBeGreaterThan(0.8);
      expect(th.fontScale, t.id).toBeLessThan(1.25);
      expect(th.lineHeight, t.id).toBeGreaterThan(1);
      expect(th.radius, t.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("每套模板都有中文名与一句话描述", () => {
    for (const t of TEMPLATES) {
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.summary.length, t.id).toBeGreaterThan(0);
      // eslint-disable-next-line no-control-regex
      expect(/[一-龥]/.test(t.name), t.id).toBe(true);
    }
  });
});
