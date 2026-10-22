"use client";

import type { ResumeData } from "@/lib/validation/resume";
import type { TemplateDef } from "@/lib/templates/types";
import { toCssVars } from "./layouts/parts";
import { SingleClassic } from "./layouts/single-classic";
import { SingleModern } from "./layouts/single-modern";
import { SidebarLeft } from "./layouts/sidebar-left";
import { SidebarRight } from "./layouts/sidebar-right";
import { TwoColumn } from "./layouts/two-column";
import { Timeline } from "./layouts/timeline";
import { CardGrid } from "./layouts/card-grid";
import styles from "./templates.module.css";

/**
 * 模板渲染入口(HTML 端)。
 *
 * 结构由 layout 骨架决定,视觉由 theme token 决定 —— token 以 CSS 变量注入,
 * 与 PDF 端 `lib/pdf/theme-styles.ts` 共用同一份 ThemeTokens 定义。
 *
 * 根元素带 `data-tpl="<id>"`,专属装饰层用属性选择器写在同一个 CSS Module 里,
 * 这样才能覆写标题形态、留白节奏这类细节(跨 CSS Module 无法引用对方的哈希类名)。
 */
export function TemplateRenderer({
  def,
  data,
}: {
  def: TemplateDef;
  data: ResumeData;
}) {
  const layClass =
    def.layout === "sidebar-left" || def.layout === "sidebar-right"
      ? styles.laySide
      : def.layout === "two-column"
        ? styles.layTwo
        : styles.laySingle;

  return (
    <div
      className={`${styles.preview} ${layClass}`}
      data-tpl={def.id}
      style={toCssVars(def.theme)}
    >
      {renderLayout(def, data)}
    </div>
  );
}

function renderLayout(def: TemplateDef, data: ResumeData) {
  switch (def.layout) {
    case "single-modern":
      return <SingleModern data={data} theme={def.theme} />;
    case "sidebar-left":
      return <SidebarLeft data={data} theme={def.theme} />;
    case "sidebar-right":
      return <SidebarRight data={data} theme={def.theme} />;
    case "two-column":
      return <TwoColumn data={data} theme={def.theme} />;
    case "timeline":
      return <Timeline data={data} theme={def.theme} />;
    case "card-grid":
      return <CardGrid data={data} theme={def.theme} />;
    case "single-classic":
    default:
      return <SingleClassic data={data} theme={def.theme} />;
  }
}
