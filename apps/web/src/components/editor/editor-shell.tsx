/**
 * 编辑器主壳 — 左表单 + 右预览 + 顶部工具栏(模板选择/保存状态/返回).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocalDraft } from "./use-local-draft";
import { ResumeForm } from "./sections";
import { TemplateRenderer } from "./template-renderer";
import { SaveIndicator } from "./save-indicator";
import { TemplatePicker } from "@/components/templates/template-picker";
import { getTemplate } from "@/lib/templates";
import { safeStringify } from "@/lib/validation/resume";
import type { ResumeData } from "@/lib/validation/resume";
import styles from "./editor-shell.module.css";

interface Props {
  resumeId: string;
  initialTitle: string;
  initialTemplate: string;
  initialData: ResumeData;
  /** 服务端已保存内容的 updatedAt(ms)— 草稿比它旧就不采用 */
  initialSavedAt?: number;
  /** F20: 是否刚从导入流程跳转过来 */
  imported?: boolean;
  /** 导入时没能识别出来的必填字段 */
  missingFields?: string[];
}

type TemplateId = string;

export function EditorShell({
  resumeId,
  initialTitle,
  initialTemplate,
  initialData,
  initialSavedAt,
  imported = false,
  missingFields = [],
}: Props) {
  const router = useRouter();
  const [showImportTip, setShowImportTip] = useState(imported);
  /** 模板选择器弹层 */
  const [tplPickerOpen, setTplPickerOpen] = useState(false);

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
    initialTemplate: getTemplate(initialTemplate).id,
    initialSavedAt,
    onPersist,
    debounceMs: 5000,
  });

  // 注意:不要在这里额外监听 pagehide/beforeunload 做 flush ——
  // useLocalDraft 已经处理,且 flush() 是异步的,卸载期间不会等到完成。
  // 这里重复监听只会引入竞态(基于 saveState 判断,状态可能还没更新)。

  // 模板切换预览缩放自适应
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const el = previewWrapRef.current;
      if (!el) return;
      // 必须用 getBoundingClientRect 而不是 clientWidth:
      // clientWidth 会因为垂直滚动条出现/消失而变化,而缩放又会改变
      // 预览高度 → 滚动条显隐 → clientWidth 变化,形成 ResizeObserver 死循环
      // (表现为主线程被占满,页面 load 事件永远不触发)。
      // getBoundingClientRect().width 是 border-box 宽度,不受滚动条影响。
      const w = el.getBoundingClientRect().width - 32; // 减去 .right 的左右 padding
      // sheet 宽 794,留点边距,用 0.95 系数
      const raw = Math.min(1, Math.max(0.25, (w - 16) / 794));
      const s = Math.round(raw * 1000) / 1000; // 量化到 0.001,避免亚像素抖动
      // 变化过小就不 setState,防止无意义的重渲染
      setScale((prev) => (Math.abs(prev - s) < 0.001 ? prev : s));
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
    } catch (e: unknown) {
      console.error("[export] failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`导出失败: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  // 返回列表页 — 必须 await flush 完成再跳转,
  // 否则路由切换会取消未完成的 PATCH 请求(用户报告"返回后再进入内容丢失")
  const [leaving, setLeaving] = useState(false);
  const goBack = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await draft.flush();
      router.push("/resumes");
      router.refresh();
    } catch {
      // flush 内部已处理错误并保留 IndexedDB 草稿,照样跳转,
      // 用户下次打开能从未同步的草稿恢复
      router.push("/resumes");
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" onClick={goBack} disabled={leaving} className={styles.back}>
          {leaving ? "保存中…" : "← 返回"}
        </button>
        <input
          className={styles.titleInput}
          value={draft.title}
          onChange={(e) => draft.setTitle(e.target.value)}
          placeholder="简历标题"
          aria-label="简历标题"
        />
        <button
          type="button"
          onClick={() => setTplPickerOpen(true)}
          className={styles.tplBtn}
          title={getTemplate(draft.template).summary}
        >
          ▦ {getTemplate(draft.template).name}
        </button>
        <button type="button" onClick={onExportPdf} disabled={exporting} className={styles.exportBtn}>
          {exporting ? "导出中…" : "导出 PDF"}
        </button>
        <SaveIndicator state={draft.saveState} lastSavedAt={draft.lastSavedAt} onFlush={() => draft.flush()} />
      </header>

      {showImportTip && (
        <div className={styles.importTip} role="status">
          <div className={styles.importTipBody}>
            <strong>导入完成</strong>
            <span>
              {missingFields.length > 0
                ? `没能自动识别出:${missingFields.join("、")},请在左侧补齐后保存。`
                : "识别到的字段已经填好,核对一遍就可以直接导出。"}
            </span>
          </div>
          <button
            type="button"
            className={styles.importTipClose}
            onClick={() => setShowImportTip(false)}
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.split}>
        <section className={styles.left}>
          <ResumeForm data={draft.data} onChange={draft.setData} />
        </section>
        <section
          className={styles.right}
          ref={previewWrapRef}
          // 预览画布固定 794px,窄屏下必然横向溢出 — 显式关掉横向滚动条,
          // 否则它会挤占纵向空间。视觉内容是等比缩放后居中的,不会被裁掉。
          style={{ overflowX: "hidden" }}
        >
          <div
            className={styles.previewScale}
            style={{ transform: `scale(${scale})`, height: 1123 * scale }}
          >
            <TemplateRenderer def={getTemplate(draft.template)} data={draft.data} />
          </div>
        </section>
      </div>

      {tplPickerOpen && (
        <TemplatePicker
          mode="switch"
          onSelect={(id) => {
            draft.setTemplate(id);
            setTplPickerOpen(false);
          }}
          onClose={() => setTplPickerOpen(false)}
        />
      )}
    </div>
  );
}