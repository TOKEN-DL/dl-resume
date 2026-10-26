/**
 * 多格式简历导入(F20)
 *
 * 流程:选文件 → 浏览器内解析 → 字段预览 → 确认创建 → 进入编辑器。
 *
 * 关键约束:文件内容**不会上传**。PDF/Word 的解析全部在浏览器里跑,
 * 只有解析后的 ResumeData 会走 POST 发给服务端(和自动保存同一条链路)。
 */
"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./import-resume.module.css";
import {
  parseResumeFile,
  ImportError,
  ACCEPT_ATTR,
  FORMAT_LABEL,
  type ResumeFormat,
} from "@/lib/import/parse-file";
import { resumeFromText } from "@/lib/import/from-text";
import type { ResumeData } from "@/lib/validation/resume";

type Stage = "idle" | "parsing" | "preview" | "error" | "saving";

interface ParsedState {
  fileName: string;
  format: ResumeFormat;
  data: ResumeData;
  rawText: string;
  diagnostics: ReturnType<typeof resumeFromText>["diagnostics"];
  meta: { bytes: number; charCount: number; pageCount?: number; warnings: string[] };
}

const SECTION_LABEL: Record<string, string> = {
  work: "工作经历",
  education: "教育背景",
  projects: "项目经历",
  skills: "专业技能",
  languages: "语言能力",
  awards: "荣誉奖项",
  certificates: "证书",
  interests: "兴趣爱好",
  summary: "个人简介",
  basic: "基本信息",
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportResumeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** 服务端创建成功,回调新简历 id */
  onCreated: (resumeId: string, missingFields: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [parsed, setParsed] = useState<ParsedState | null>(null);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setError(null);
    setParsed(null);

    try {
      const result = await parseResumeFile(file);
      const { data, diagnostics } = resumeFromText(result.text);
      setParsed({
        fileName: file.name,
        format: result.format,
        data,
        rawText: result.text,
        diagnostics,
        meta: result.meta,
      });
      setStage("preview");
    } catch (e) {
      const err =
        e instanceof ImportError
          ? e
          : new ImportError("parse-failed", "解析失败", "请换一个文件再试");
      setError({ message: err.message, hint: err.hint });
      setStage("error");
    }
  }, []);

  async function confirm() {
    if (!parsed) return;
    setStage("saving");
    setError(null);

    try {
      const res = await fetch("/api/resumes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsed.data.basics.name.trim() || parsed.fileName.replace(/\.[^.]+$/, ""),
          template: "classic",
          data: parsed.data,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError({
          message: body.error === "unauthorized" ? "登录状态已失效" : `保存失败(${res.status})`,
          hint: "请刷新页面后重试",
        });
        setStage("preview");
        return;
      }
      const body = await res.json();
      onCreated(body.resume.id, body.missingFields ?? []);
    } catch {
      setError({ message: "网络异常", hint: "请检查网络后重试" });
      setStage("preview");
    }
  }

  function reset() {
    setParsed(null);
    setError(null);
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>导入简历</h2>
            <p className={styles.desc}>
              支持 PDF、Word(.docx)、Markdown 和纯文本。文件在你的浏览器里解析,不会上传。
            </p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className={styles.body}>
          {/* ── 选择文件 ─────────────────────────────────────────── */}
          {(stage === "idle" || stage === "parsing" || stage === "error") && (
            <>
              <button
                type="button"
                className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={stage === "parsing"}
              >
                {stage === "parsing" ? (
                  <>
                    <div className={styles.spinner} />
                    <div className={styles.dropTitle}>正在本地解析…</div>
                    <div className={styles.dropHint}>
                      大文件和 PDF 会慢一些,全程不上传
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.dropIcon}>↑</div>
                    <div className={styles.dropTitle}>点击选择,或把文件拖到这里</div>
                    <div className={styles.dropHint}>PDF · .docx · .md · .txt,最大 20MB</div>
                  </>
                )}
              </button>

              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTR}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />

              {stage === "error" && error && (
                <div className={styles.error}>
                  <div className={styles.errorTitle}>{error.message}</div>
                  <div className={styles.errorHint}>{error.hint}</div>
                  <button className={styles.linkBtn} onClick={reset}>
                    重新选择文件
                  </button>
                </div>
              )}

              <div className={styles.notice}>
                <strong>不支持 .doc(2003 旧版 Word)</strong> —— 请在 Word 里另存为 .docx,
                或导出成 PDF。扫描件 PDF 没有文字层,需要 OCR,当前版本会明确报错而不是给你一份空简历。
              </div>
            </>
          )}

          {/* ── 字段预览 ─────────────────────────────────────────── */}
          {stage !== "idle" && parsed && (
            <div className={styles.preview}>
              <div className={styles.fileRow}>
                <span className={styles.tag}>{FORMAT_LABEL[parsed.format]}</span>
                <span className={styles.fileName}>{parsed.fileName}</span>
                <span className={styles.fileMeta}>
                  {humanSize(parsed.meta.bytes)}
                  {parsed.meta.pageCount ? ` · ${parsed.meta.pageCount} 页` : ""}
                  {" · "}
                  {parsed.meta.charCount} 字
                </span>
              </div>

              <div className={styles.basicsGrid}>
                <Field label="姓名" value={parsed.data.basics.name} />
                <Field label="邮箱" value={parsed.data.basics.email} />
                <Field label="电话" value={parsed.data.basics.phone} />
                <Field label="求职意向" value={parsed.data.basics.label} />
                <Field label="所在地" value={parsed.data.basics.location} />
                <Field label="兴趣爱好" value={parsed.data.interests} />
              </div>

              <div className={styles.counts}>
                {Object.entries(parsed.diagnostics.counts)
                  .filter(([, n]) => n > 0)
                  .map(([key, n]) => (
                    <span key={key} className={styles.count}>
                      {SECTION_LABEL[key] ?? key}
                      <b>{n}</b>
                    </span>
                  ))}
                {Object.values(parsed.diagnostics.counts).every((n) => n === 0) && (
                  <span className={styles.countEmpty}>
                    没有识别到结构化章节,可能这份简历排版比较特殊 ——
                    导入后可以在编辑器里手动补充
                  </span>
                )}
              </div>

              {parsed.diagnostics.missingRequired.length > 0 && (
                <div className={styles.warn}>
                  未识别到:{parsed.diagnostics.missingRequired.join("、")}。导入后可在编辑器里补齐。
                </div>
              )}

              {parsed.meta.warnings.length > 0 && (
                <div className={styles.warn}>
                  {parsed.meta.warnings.slice(0, 2).join(";")}
                </div>
              )}

              {error && (
                <div className={styles.error}>
                  <div className={styles.errorTitle}>{error.message}</div>
                  <div className={styles.errorHint}>{error.hint}</div>
                </div>
              )}

              <details className={styles.raw}>
                <summary>查看解析出的原文({parsed.meta.charCount} 字)</summary>
                <pre>{parsed.rawText.slice(0, 4000)}</pre>
              </details>
            </div>
          )}
        </div>

        {/* ── 操作 ─────────────────────────────────────────────── */}
        <footer className={styles.footer}>
          {parsed ? (
            <>
              <button className={styles.btnGhost} onClick={reset} disabled={stage === "saving"}>
                换一个文件
              </button>
              <button className={styles.btnPrimary} onClick={confirm} disabled={stage === "saving"}>
                {stage === "saving" ? "创建中…" : "导入并进入编辑器"}
              </button>
            </>
          ) : (
            <button className={styles.btnGhost} onClick={onClose}>
              取消
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldValue} ${value ? "" : styles.fieldEmpty}`}>
        {value || "未识别"}
      </span>
    </div>
  );
}