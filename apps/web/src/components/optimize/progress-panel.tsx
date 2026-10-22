"use client";

/**
 * 进度面板 —— 优化跑起来之后看到的界面。
 *
 * 核心是那条进度条 + 六个节点。每个节点有自己的状态和耗时,
 * 用户能看清「现在到哪了、这一步做了什么」。
 *
 * 页面可以随时离开:任务在服务端继续,回来接着看就行。
 */
import { STAGES, STAGE_STATUS_LABEL } from "@/lib/optimize/stages";
import type { JobSummary, StageStatus } from "@/lib/optimize/types";
import styles from "./optimize.module.css";

const ICONS: Record<StageStatus, string> = {
  pending: "○",
  running: "◐",
  done: "✓",
  failed: "✕",
  skipped: "–",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ProgressPanel({
  job,
  onDiscard,
}: {
  job: JobSummary;
  onDiscard: () => void;
}) {
  const byKey = new Map(job.stages.map((s) => [s.key, s]));
  const done = job.stages.filter((s) => s.status === "done").length;
  const pct = Math.round(job.progress * 100);
  const running = job.stages.find((s) => s.status === "running");
  const currentTitle = running
    ? STAGES.find((s) => s.key === running.key)?.title
    : undefined;

  return (
    <div className={styles.progressCard}>
      <div className={styles.progressHead}>
        <div>
          <div className={styles.progressTitle}>
            {currentTitle ? `正在${currentTitle}` : "正在准备优化"}
          </div>
          <div className={styles.progressSub}>
            优化「{job.title}」 · {done}/{STAGES.length} 个节点已完成
          </div>
        </div>
        <div className={styles.progressPct}>{pct}%</div>
      </div>

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>

      <ol className={styles.stageList}>
        {STAGES.map((def) => {
          const s = byKey.get(def.key);
          const status = s?.status ?? "pending";
          const dur =
            s?.startedAt && s?.finishedAt ? s.finishedAt - s.startedAt : null;
          return (
            <li
              key={def.key}
              className={`${styles.stage} ${styles[`stage_${status}`] ?? ""}`}
              data-stage={def.key}
              data-status={status}
            >
              <span className={styles.stageDot} aria-hidden="true">
                {ICONS[status]}
              </span>
              <span className={styles.stageBody}>
                <span className={styles.stageRow}>
                  <span className={styles.stageName}>{def.title}</span>
                  <span className={styles.stageStatus}>
                    {STAGE_STATUS_LABEL[status]}
                    {dur !== null && status === "done" && ` · ${formatDuration(dur)}`}
                  </span>
                </span>
                <span className={styles.stageDetail}>
                  {s?.error ? s.error : (s?.detail ?? def.hint)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className={styles.progressFoot}>
        <p className={styles.leaveHint}>
          优化在服务端后台进行,你可以放心去别的页面 —— 回来之后进度还在。
        </p>
        <button type="button" className={styles.ghostBtn} onClick={onDiscard}>
          放弃这次优化
        </button>
      </div>
    </div>
  );
}

export default ProgressPanel;
