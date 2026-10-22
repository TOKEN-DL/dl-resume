"use client";

/**
 * 来源选择 —— 从历史简历里挑一份,或者直接导入一个文件。
 *
 * 导入走的是 F20 那套浏览器端解析(PDF/Word/Markdown → 文本 → 结构化),
 * 文件本身不会发到服务器;只有解析出来的结构化内容会发给优化引擎。
 */
import { useRef, useState } from "react";
import { TemplateThumb } from "@/components/templates/template-thumb";
import { getTemplate } from "@/lib/templates";
import type { ResumeData } from "@/lib/validation/resume";
import type { OptimizeResumeItem } from "./optimize-workspace";
import styles from "./optimize.module.css";

export interface StartPayload {
  kind: "resume" | "upload";
  resumeId?: string;
  title?: string;
  template?: string;
  fileName?: string;
  data?: unknown;
}

interface ParsedUpload {
  data: ResumeData;
  fileName: string;
  diagnostics: {
    sectionsFound: string[];
    counts: Record<string, number>;
    missingRequired: string[];
  };
  warnings: string[];
}

export function SourcePicker({
  resumes,
  busy,
  onStart,
}: {
  resumes: OptimizeResumeItem[];
  busy: boolean;
  onStart: (payload: StartPayload) => void;
}) {
  const [tab, setTab] = useState<"history" | "upload">("history");
  const [selectedId, setSelectedId] = useState<string | null>(resumes[0]?.id ?? null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onFile(file: File) {
    setParsing(true);
    setParseError(null);
    setParsed(null);
    try {
      // 动态引入:pdfjs / mammoth 有好几 MB,不该进首屏包
      const [{ parseResumeFile, ACCEPT_ATTR }, { resumeFromText }] = await Promise.all([
        import("@/lib/import/parse-file"),
        import("@/lib/import/from-text"),
      ]);
      const r = await parseResumeFile(file);
      const result = resumeFromText(r.text);
      setParsed({
        data: result.data,
        fileName: file.name,
        diagnostics: result.diagnostics,
        warnings: r.meta.warnings,
      });
      // accept 属性顺带设置一次,省得在 JSX 里硬编码一份
      if (fileRef.current) fileRef.current.accept = ACCEPT_ATTR;
    } catch (e) {
      const err = e as { message?: string; hint?: string };
      setParseError(
        err.hint ? `${err.message ?? "解析失败"} —— ${err.hint}` : (err.message ?? "解析失败"),
      );
    } finally {
      setParsing(false);
    }
  }

  const selected = resumes.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={styles.picker}>
      <div className={styles.tabs} role="tablist" aria-label="选择优化来源">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`${styles.tab} ${tab === "history" ? styles.tabActive : ""}`}
          onClick={() => setTab("history")}
        >
          从历史简历选
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upload"}
          className={`${styles.tab} ${tab === "upload" ? styles.tabActive : ""}`}
          onClick={() => setTab("upload")}
        >
          导入新简历
        </button>
      </div>

      {tab === "history" && (
        <div className={styles.tabPanel}>
          {resumes.length === 0 ? (
            <div className={styles.emptyBox}>
              还没有简历。先去「我的简历」新建一份,或者切到「导入新简历」上传一个文件。
            </div>
          ) : (
            <>
              <div className={styles.resumeGrid}>
                {resumes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`${styles.resumeItem} ${
                      r.id === selectedId ? styles.resumeItemActive : ""
                    }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span className={styles.resumeThumb}>
                      <TemplateThumb
                        def={getTemplate(r.template)}
                        data={r.data}
                        lazy={false}
                      />
                    </span>
                    <span className={styles.resumeMeta}>
                      <span className={styles.resumeTitle}>{r.title}</span>
                      <span className={styles.resumeSub}>
                        {getTemplate(r.template).name}
                      </span>
                    </span>
                    <span className={styles.radio} aria-hidden="true" />
                  </button>
                ))}
              </div>

              <div className={styles.pickerActions}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy || !selected}
                  onClick={() =>
                    selected &&
                    onStart({ kind: "resume", resumeId: selected.id })
                  }
                >
                  {busy ? "正在提交…" : "开始优化"}
                </button>
                {selected && (
                  <span className={styles.pickerHint}>
                    将优化「{selected.title}」,原简历不会被改动。
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "upload" && (
        <div className={styles.tabPanel}>
          <label className={styles.dropzone}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <span className={styles.dropIcon} aria-hidden="true">
              ↑
            </span>
            <span className={styles.dropTitle}>
              {parsing ? "正在解析…" : "选择要优化的简历文件"}
            </span>
            <span className={styles.dropSub}>
              支持 PDF / Word(.docx) / Markdown / 纯文本 —— 解析在浏览器里完成,文件不上传
            </span>
          </label>

          {parseError && <div className={styles.parseError}>{parseError}</div>}

          {parsed && (
            <div className={styles.parsedBox}>
              <div className={styles.parsedPreview}>
                <TemplateThumb
                  def={getTemplate("classic")}
                  data={parsed.data}
                  lazy={false}
                />
              </div>
              <div className={styles.parsedMeta}>
                <div className={styles.parsedTitle}>{parsed.fileName}</div>
                <dl className={styles.parsedStats}>
                  <div>
                    <dt>姓名</dt>
                    <dd>{parsed.data.basics.name || "未识别"}</dd>
                  </div>
                  <div>
                    <dt>工作经历</dt>
                    <dd>{parsed.data.work.length} 段</dd>
                  </div>
                  <div>
                    <dt>项目</dt>
                    <dd>{parsed.data.projects.length} 个</dd>
                  </div>
                  <div>
                    <dt>技能</dt>
                    <dd>{parsed.data.skills.length} 项</dd>
                  </div>
                </dl>
                {parsed.diagnostics.missingRequired.length > 0 && (
                  <p className={styles.parsedWarn}>
                    有些必填项没能自动识别:{parsed.diagnostics.missingRequired.join("、")}。
                    不影响优化,但补上会更准。
                  </p>
                )}
                {parsed.warnings.length > 0 && (
                  <p className={styles.parsedWarn}>{parsed.warnings.join(";")}</p>
                )}
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() =>
                    onStart({
                      kind: "upload",
                      title: parsed.data.basics.name || parsed.fileName,
                      template: "classic",
                      fileName: parsed.fileName,
                      data: parsed.data,
                    })
                  }
                >
                  {busy ? "正在提交…" : "开始优化"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SourcePicker;
