"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { TemplateGallery } from "@/components/templates/template-picker";

/**
 * /templates 的客户端部分 —— create 模式。
 *
 * 画廊的筛选 / 缩略图网格 / 卡片与编辑器「换模板」弹层共用
 * `components/templates/template-picker` 里的 `TemplateGallery`,
 * 这里只负责「选中模板 → 建简历 → 跳编辑器」这条链路。
 */
export function GalleryClient() {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createFromTemplate(templateId: string) {
    const def = getTemplate(templateId);
    setBusyId(templateId);
    setError(null);
    try {
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "未命名简历",
          template: def.id,
          data: def.sample,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { resume?: { id?: string }; error?: unknown }
        | null;

      if (!res.ok) {
        setError(readError(payload, res.status));
        return;
      }
      const id = payload?.resume?.id;
      if (!id) {
        setError("创建成功但没有拿到简历 id,请刷新页面后重试。");
        return;
      }
      router.push(`/resumes/${id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败,请稍后重试。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <TemplateGallery
      mode="create"
      onSelect={createFromTemplate}
      busyId={busyId}
      error={error}
    />
  );
}

/** 后端 400 时把 JSON 里的 error 字段显示出来 */
function readError(payload: { error?: unknown } | null, status: number): string {
  const e = payload?.error;
  if (typeof e === "string" && e) {
    if (e === "unauthorized") return "请先登录,再从模板新建简历。";
    return e;
  }
  if (e) return JSON.stringify(e);
  return `创建失败(HTTP ${status}),请稍后重试。`;
}

export default GalleryClient;
