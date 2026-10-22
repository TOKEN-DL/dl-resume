/**
 * PDF 文档入口 —— 32 套模板 × 7 种布局骨架。
 *
 * 结构由 layout 骨架决定,视觉由 theme token 决定:
 * 与 HTML 端(`components/editor/template-renderer.tsx`)同源同构,
 * 同一份 ThemeTokens 驱动两端,避免预览 / PDF 视觉漂移。
 *
 * 入口签名保持兼容:`{ data, template }`,template 为模板 id 字符串,
 * 未知 id 由 getTemplate() 自动回退 classic。
 */
import { getTemplate } from "@/lib/templates/registry";
import type { ResumeData } from "@/lib/validation/resume";
import { PdfCardGrid } from "./layouts/card-grid";
import { PdfSidebarLeft } from "./layouts/sidebar-left";
import { PdfSidebarRight } from "./layouts/sidebar-right";
import { PdfSingleClassic } from "./layouts/single-classic";
import { PdfSingleModern } from "./layouts/single-modern";
import { PdfTimeline } from "./layouts/timeline";
import { PdfTwoColumn } from "./layouts/two-column";

/**
 * 模板 id —— 注册表里的模板 id。
 * 刻意放宽为 string:调用方(route.ts)持有的是数据库里的自由字符串,
 * 未知值由 getTemplate() 兜底到 classic。
 */
export type TemplateId = string;

export interface ResumeDocumentProps {
  data: ResumeData;
  template: TemplateId;
}

export function ResumeDocument({ data, template }: ResumeDocumentProps) {
  const def = getTemplate(template);
  switch (def.layout) {
    case "single-modern":
      return <PdfSingleModern data={data} theme={def.theme} />;
    case "sidebar-left":
      return <PdfSidebarLeft data={data} theme={def.theme} />;
    case "sidebar-right":
      return <PdfSidebarRight data={data} theme={def.theme} />;
    case "two-column":
      return <PdfTwoColumn data={data} theme={def.theme} />;
    case "timeline":
      return <PdfTimeline data={data} theme={def.theme} />;
    case "card-grid":
      return <PdfCardGrid data={data} theme={def.theme} />;
    case "single-classic":
    default:
      return <PdfSingleClassic data={data} theme={def.theme} />;
  }
}
