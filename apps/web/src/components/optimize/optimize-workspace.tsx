"use client";

/**
 * 优化工作区 —— 状态机 + 轮询。
 *
 * 三段式:选来源 → 跑进度 → 看报告并确认。
 *
 * **后台不打断**的关键在这里:进度完全由服务端任务驱动,前端只负责轮询
 * GET /api/optimize/[id]。用户切到别的页面、刷新、甚至关掉标签页,
 * 任务都在服务端继续跑;回来时 GET /api/optimize 能找到那个任务并接管。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SourcePicker } from "./source-picker";
import { ProgressPanel } from "./progress-panel";
import { ReportPanel } from "./report-panel";
import { OPTIMIZE_CHANGED_EVENT } from "./optimize-badge";
import type { JobSummary, OptimizeReport } from "@/lib/optimize/types";
import type { ResumeData } from "@/lib/validation/resume";
import styles from "./optimize.module.css";

export interface OptimizeResumeItem {
  id: string;
  title: string;
  template: string;
  updatedAt: string;
  /** 简历正文 —— 选择器里要渲染真实缩略图 */
  data?: ResumeData;
}

type Phase = "source" | "running" | "result" | "confirmed";

/** 轮询间隔:节点最短展示 420ms,700ms 一跳刚好能看清推进 */
const POLL_MS = 700;

export function OptimizeWorkspace({ resumes }: { resumes: OptimizeResumeItem[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("source");
  const [job, setJob] = useState<JobSummary | null>(null);
  const [report, setReport] = useState<OptimizeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 拉一次任务状态 */
  const fetchJob = useCallback(
    async (jobId: string) => {
      const r = await fetch(`/api/optimize/${jobId}`, { cache: "no-store" });
      if (!r.ok) return null;
      const body = await r.json();
      setJob(body.job);
      if (body.report) setReport(body.report);
      return body.job as JobSummary;
    },
    [],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      timerRef.current = setInterval(async () => {
        const j = await fetchJob(jobId);
        if (!j) return;
        if (j.status === "awaiting-confirm") {
          stopPolling();
          setPhase("result");
        } else if (j.status === "confirmed") {
          stopPolling();
          setPhase("confirmed");
        } else if (j.status === "failed" || j.status === "cancelled") {
          stopPolling();
          setError(j.error ?? "优化任务已终止");
          setPhase("source");
        }
      }, POLL_MS);
    },
    [fetchJob, stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  /**
   * 进页面先找有没有「还在跑 / 等确认」的任务。
   * 这就是「切页不被打断」的落地:上一个页面开的优化,回来还能接上。
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/optimize", { cache: "no-store" });
        if (!r.ok) return;
        const { jobs } = await r.json();
        if (cancelled) return;
        const active = (jobs as JobSummary[]).find(
          (j) =>
            j.status === "running" ||
            j.status === "queued" ||
            j.status === "awaiting-confirm",
        );
        if (!active) return;
        setJob(active);
        if (active.status === "awaiting-confirm") {
          await fetchJob(active.id);
          setPhase("result");
        } else {
          setPhase("running");
          startPolling(active.id);
        }
      } catch {
        /* 拉不到就当没有历史任务 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchJob, startPolling]);

  /** 发起优化 */
  async function start(payload: {
    kind: "resume" | "upload";
    resumeId?: string;
    title?: string;
    template?: string;
    fileName?: string;
    data?: unknown;
  }) {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source:
            payload.kind === "resume"
              ? { kind: "resume", resumeId: payload.resumeId }
              : {
                  kind: "upload",
                  title: payload.title,
                  template: payload.template,
                  fileName: payload.fileName,
                  data: payload.data,
                },
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? "创建优化任务失败");
        return;
      }
      setJob(body.job);
      setReport(null);
      setPhase("running");
      startPolling(body.job.id);
      // 通知顶栏的指示器:有新任务了,让它立刻亮起来
      window.dispatchEvent(new CustomEvent(OPTIMIZE_CHANGED_EVENT));
    } catch {
      setError("网络错误,请稍后重试");
    } finally {
      setStarting(false);
    }
  }

  /** 确认入库 */
  async function confirm() {
    if (!job) return;
    setConfirming(true);
    setError(null);
    try {
      const r = await fetch(`/api/optimize/${job.id}/confirm`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? "确认失败,请稍后重试");
        return;
      }
      setPhase("confirmed");
      if (body.resumeId) setJob((j) => (j ? { ...j, resultResumeId: body.resumeId } : j));
    } catch {
      setError("网络错误,请稍后重试");
    } finally {
      setConfirming(false);
    }
  }

  /** 放弃 */
  async function discard() {
    if (job) {
      await fetch(`/api/optimize/${job.id}`, { method: "DELETE" }).catch(() => {});
    }
    stopPolling();
    setJob(null);
    setReport(null);
    setError(null);
    setPhase("source");
  }

  return (
    <div className={styles.workspace}>
      {error && (
        <div className={styles.errorBar} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}

      {phase === "source" && (
        <SourcePicker
          resumes={resumes}
          busy={starting}
          onStart={start}
        />
      )}

      {phase === "running" && job && (
        <ProgressPanel
          job={job}
          onDiscard={discard}
        />
      )}

      {phase === "result" && job && report && (
        <ReportPanel
          job={job}
          report={report}
          confirming={confirming}
          onConfirm={confirm}
          onDiscard={discard}
          onOpenResume={(id) => router.push(`/resumes/${id}/edit`)}
        />
      )}

      {phase === "confirmed" && job && (
        <div className={styles.doneCard}>
          <div className={styles.doneIcon} aria-hidden="true">
            ✓
          </div>
          <h2 className={styles.doneTitle}>优化版已经进入简历历史</h2>
          <p className={styles.doneSub}>
            原简历没有被改动,优化版作为一份新简历保存,可以在编辑器里继续打磨。
          </p>
          <div className={styles.doneActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push(`/resumes/${job.resultResumeId}/edit`)}
            >
              打开优化版 →
            </button>
            <button type="button" className={styles.ghostBtn} onClick={discard}>
              再优化一份
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OptimizeWorkspace;
