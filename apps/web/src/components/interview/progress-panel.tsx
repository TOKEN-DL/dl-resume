"use client";

/**
 * 进度面板 —— 押题跑起来之后看到的界面。
 *
 * 核心是那条进度条 + 五个节点(简历扫描 → 出题 → 查重 → 出答案 → 待确认入库)。
 * 每个节点有自己的状态和一句话结果,用户能看清「现在到哪了、这一步做了什么」。
 *
 * 页面可以随时离开:任务在服务端继续,回来接着看就行。
 */
import { STAGES, STAGE_STATUS_LABEL } from "@/lib/interview/stages";
import type { InterviewJobSummary, StageStatus } from "@/lib/interview/types";
import styles from "./interview.module.css";

/**
 * 节点状态图标。
 *
 * 刻意用几何符号而不是「✓」「✗」这类 dingbat —— dingbat 落在
 * emoji 的码位区间里,跟「题干与参考答案不许出现表情符号」的口径打架。
 */
const ICONS: Record<StageStatus, string> = {
  pending: "○",
  running: "◐",
  done: "●",
  failed: "×",
  skipped: "–",
};

/** 每种状态对应哪个类名 —— 写成静态表,加状态忘了加样式 tsc 就会拦下来 */
const STATUS_CLASS: Record<StageStatus, string> = {
  pending: styles.ipStagePending,
  running: styles.ipStageRunning,
  done: styles.ipStageDone,
  failed: styles.ipStageFailed,
  skipped: styles.ipStageSkipped,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ProgressPanel({
  job,
  onDiscard,
}: {
  job: InterviewJobSummary;
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
    <div className={styles.ipCard}>
      <div className={styles.ipHead}>
        <div>
          <div className={styles.ipTitle}>
            {currentTitle ? `正在${currentTitle}` : "正在准备押题"}
          </div>
          <div className={styles.ipSub}>
            押题「{job.title}」 · {done}/{STAGES.length} 个节点已完成
          </div>
        </div>
        <div className={styles.ipPct}>{pct}%</div>
      </div>

      <div
        className={styles.ipTrack}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.ipFill} style={{ width: `${pct}%` }} />
      </div>

      <ol className={styles.ipStageList}>
        {STAGES.map((def) => {
          const s = byKey.get(def.key);
          const status = s?.status ?? "pending";
          const dur = s?.startedAt && s?.finishedAt ? s.finishedAt - s.startedAt : null;
          return (
            <li
              key={def.key}
              className={`${styles.ipStage} ${STATUS_CLASS[status]}`}
              data-stage={def.key}
              data-status={status}
            >
              <span className={styles.ipStageDot} aria-hidden="true">
                {ICONS[status]}
              </span>
              <span className={styles.ipStageBody}>
                <span className={styles.ipStageRow}>
                  <span className={styles.ipStageName}>{def.title}</span>
                  <span className={styles.ipStageStatus}>
                    {STAGE_STATUS_LABEL[status]}
                    {dur !== null && status === "done" && ` · ${formatDuration(dur)}`}
                  </span>
                </span>
                <span className={styles.ipStageDetail}>
                  {s?.error ? s.error : (s?.detail ?? def.hint)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className={styles.ipFoot}>
        <p className={styles.ipLeaveHint}>
          押题在服务端后台进行,你可以放心去别的页面 —— 回来之后进度还在。
        </p>
        <button type="button" className={styles.iwGhostBtn} onClick={onDiscard}>
          放弃这次押题
        </button>
      </div>
    </div>
  );
}

export default ProgressPanel;
