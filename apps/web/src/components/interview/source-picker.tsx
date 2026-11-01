"use client";

/**
 * 来源选择 —— 从我的历史简历里挑一份,发起押题。
 *
 * 与优化模块的 SourcePicker 同构但更窄:押题目前只支持「从历史简历选」,
 * 不支持浏览器端解析上传文件(那要占好几 MB 的动态依赖,押题用不上)。
 * 将来要加「导入新简历」时,在这里加一个 tab 即可。
 */
import { useState } from "react";
import styles from "./interview.module.css";

export interface InterviewResumeItem {
  id: string;
  title: string;
  template: string;
  updatedAt: string;
}

export interface InterviewStartPayload {
  kind: "resume";
  resumeId: string;
}

export function SourcePicker({
  resumes,
  busy,
  onStart,
}: {
  resumes: InterviewResumeItem[];
  busy: boolean;
  onStart: (payload: InterviewStartPayload) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(resumes[0]?.id ?? null);
  const selected = resumes.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={styles.iwPicker}>
      <div className={styles.iwPickerHead}>
        <h2 className={styles.iwPickerTitle}>选一份简历,开始押题</h2>
        <p className={styles.iwPickerSub}>
          押题会针对这份简历的技能与项目出 12 道题,从入门理解一路排到场景深挖,
          题干常显、答案默认收起。任务在后台跑,你可以随时离开这个页面。
        </p>
      </div>

      {resumes.length === 0 ? (
        <div className={styles.iwEmptyBox}>
          还没有简历。先去「我的简历」新建一份,回来就能押题。
        </div>
      ) : (
        <>
          <ul className={styles.iwResumeList}>
            {resumes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`${styles.iwResumeItem} ${
                    r.id === selectedId ? styles.iwResumeItemActive : ""
                  }`}
                  aria-pressed={r.id === selectedId}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span className={styles.iwResumeMeta}>
                    <span className={styles.iwResumeTitle}>{r.title}</span>
                    <span className={styles.iwResumeSub}>{formatWhen(r.updatedAt)}</span>
                  </span>
                  <span className={styles.iwRadio} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.iwActions}>
            <button
              type="button"
              className={styles.iwPrimaryBtn}
              disabled={busy || !selected}
              onClick={() =>
                selected && onStart({ kind: "resume", resumeId: selected.id })
              }
            >
              {busy ? "正在提交…" : "开始押题"}
            </button>
            {selected && (
              <span className={styles.iwHint}>
                将为「{selected.title}」出题,原简历不会被改动。
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 相对时间 —— 和「我的简历」列表页保持同一套说法 */
function formatWhen(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default SourcePicker;
