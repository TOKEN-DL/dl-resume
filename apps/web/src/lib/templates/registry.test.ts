import { describe, it, expect } from "vitest";
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
  it("模板数量不少于 30 套", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it("id 唯一且为 kebab-case", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
    for (const id of TEMPLATE_IDS) {
      expect(id, id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
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
