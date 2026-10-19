/**
 * 编辑器主壳 — 左表单 + 右预览 + 顶部工具栏(模板选择/保存状态/返回).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocalDraft } from "./use-local-draft";
import { ResumeForm } from "./sections";
import { TemplatePreview } from "./templates";
import { SaveIndicator } from "./save-indicator";
import { safeStringify } from "@/lib/validation/resume";
import type { ResumeData } from "@/lib/validation/resume";
import styles from "./editor-shell.module.css";

interface Props {
  resumeId: string;
  initialTitle: string;
  initialTemplate: string;
  initialData: ResumeData;
}

const TEMPLATES: Array<{ id: "classic" | "modern" | "minimal"; label: string; desc: string }> = [
  { id: "classic", label: "经典", desc: "单栏 / 衬线字体 / 居中标题" },
  { id: "modern", label: "现代", desc: "单栏 / 蓝调 / 左侧色块" },
  { id: "minimal", label: "极简", desc: "单栏 / 灰调 / 间距宽松" },
];

export function EditorShell({ resumeId, initialTitle, initialTemplate, initialData }: Props) {
  const router = useRouter();

  const onPersist = async (payload: { data: ResumeData; title?: string; template?: string }) => {
    const res = await fetch(`/api/resumes/${resumeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        template: payload.template,
        data: safeStringify(payload.data),
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  };

  const draft = useLocalDraft({
    resumeId,
    initialData,
    initialTitle,
    initialTemplate: initialTemplate as any,
    onPersist,
    debounceMs: 5000,
  });

  // 离开路由前尝试 flush(浏览器原生 beforeunload 已被 hook 处理)
  useEffect(() => {
    const handler = () => {
      if (draft.saveState === "dirty") draft.flush();
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [draft]);

  // 模板切换预览缩放自适应
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const el = previewWrapRef.current;
      if (!el) return;
      const w = el.clientWidth;
      // sheet 宽 794,左右 padding 各 64 — 实际内容 794, scale = w / 794
      // 留点边距,用 0.95 系数
      const s = Math.min(1, (w - 16) / 794);
      setScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    if (previewWrapRef.current) ro.observe(previewWrapRef.current);
    return () => ro.disconnect();
  }, []);

  // PDF 导出
  const [exporting, setExporting] = useState(false);
  const onExportPdf = async () => {
    if (exporting) return;
    // 先把当前本地状态保存到服务端,确保 PDF 取到的是最新内容
    await draft.flush();
    setExporting(true);
    try {
      const res = await fetch(`/api/resumes/${resumeId}/pdf`, { method: "GET" });
      if (!res.ok) {
        alert(`导出失败: HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(disp);
      a.href = url;
      a.download = m ? decodeURIComponent(m[1]) : `${draft.title || "简历"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 给浏览器一点时间触发,然后 revoke
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      console.error("[export] failed", e);
      alert(`导出失败: ${e?.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" onClick={() => { draft.flush(); router.push("/resumes"); }} className={styles.back}>
          ← 返回
        </button>
        <input
          className={styles.titleInput}
          value={draft.title}
          onChange={(e) => draft.setTitle(e.target.value)}
          placeholder="简历标题"
          aria-label="简历标题"
        />
        <div className={styles.tplPicker} role="radiogroup" aria-label="模板">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={draft.template === t.id}
              onClick={() => draft.setTemplate(t.id)}
              className={draft.template === t.id ? styles.tplBtnActive : styles.tplBtn}
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onExportPdf} disabled={exporting} className={styles.exportBtn}>
          {exporting ? "导出中…" : "导出 PDF"}
        </button>
        <SaveIndicator state={draft.saveState} lastSavedAt={draft.lastSavedAt} onFlush={() => draft.flush()} />
      </header>

      <div className={styles.split}>
        <section className={styles.left}>
          <ResumeForm data={draft.data} onChange={draft.setData} />
        </section>
        <section className={styles.right} ref={previewWrapRef}>
          <div
            className={styles.previewScale}
            style={{ transform: `scale(${scale})`, height: 1123 * scale }}
          >
            <TemplatePreview data={draft.data} template={draft.template as any} />
          </div>
        </section>
      </div>
    </div>
  );
}