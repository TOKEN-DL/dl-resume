"use client";

import type { ResumeData } from "@/lib/validation/resume";
import { getTemplate } from "@/lib/templates";
import { TemplateRenderer } from "./template-renderer";

/**
 * 简历模板预览组件。
 *
 * 渲染的是"看起来像 PDF"的 A4 等比缩放 HTML,
 * 字号和间距按 96 DPI 设计,预览容器用 transform: scale() 缩放。
 */
export function TemplatePreview({ data, template }: { data: ResumeData; template: string }) {
  return <TemplateRenderer def={getTemplate(template)} data={data} />;
}
