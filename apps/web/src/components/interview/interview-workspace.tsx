"use client";

/**
 * 押题工作台 —— 状态机 + 轮询。
 *
 * 三段式:选来源 → 跑进度 → 看题卡。
 *
 * **后台不打断**的关键在这里:进度完全由服务端任务驱动,前端只负责轮询
 * GET /api/interview/[id]。用户切到别的页面、刷新、甚至关掉标签页,
 * 任务都在服务端继续跑;回来时 GET /api/interview 能找到那个任务并接管。
 *
 * 这一版**不入库** —— 题库入库是 #21 的活。所以跑完之后停在
 * 「待确认入库」这个节点,题卡先给用户看,勾的「重点关注」先记在本地 state 里。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { QuestionCard } from "./question-card";
import { SourcePicker, type InterviewResumeItem, type InterviewStartPayload } from "./source-picker";
import { ProgressPanel } from "./progress-panel";
import type { InterviewJobSummary, InterviewQuestion } from "@/lib/interview/types";
import styles from "./interview.module.css";

export type { InterviewResumeItem };

type Phase = "source" | "running" | "result";

/** 轮询间隔:节点最短展示 420ms,700ms 一跳刚好能看清推进 */
const POLL_MS = 700;

/** 一次出题的题数 —— 少于这个数说明模型没出够,要在界面上说清楚 */
const EXPECTED_COUNT = 12;

export function InterviewWorkspace({ resumes }: { resumes: InterviewResumeItem[] }) {
  const [phase, setPhase] = useState<Phase>("source");
  const [job, setJob] = useState<InterviewJobSummary | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  /** 「重点关注」按题目序号记 —— 这一版还没入库,先记在本地 */
  const [starred, setStarred] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 拉一次任务状态 */
  const fetchJob = useCallback(async (jobId: string) => {
    const r = await fetch(`/api/interview/${jobId}`, { cache: "no-store" });
    if (!r.ok) return null;
    const body = await r.json();
    setJob(body.job);
    const qs = (body.questions ?? body.job?.questions) as InterviewQuestion[] | undefined;
    if (qs) setQuestions(qs);
    return body.job as InterviewJobSummary;
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      timerRef.current = setInterval(async () => {
        const j = await fetchJob(jobId);
        if (!j) return;
        if (j.status === "awaiting-confirm") {
          stopPolling();
          setPhase("result");
        } else if (j.status === "failed" || j.status === "cancelled") {
          stopPolling();
          setError(j.error ?? "押题任务已终止");
          setPhase("source");
        }
      }, POLL_MS);
    },
    [fetchJob, stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  /**
   * 进页面先找有没有「还在跑 / 等确认」的任务。
   * 这就是「切页不被打断」的落地:上一个页面开的押题,回来还能接上。
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/interview", { cache: "no-store" });
        if (!r.ok) return;
        const { jobs } = await r.json();
        if (cancelled) return;
        const active = (jobs as InterviewJobSummary[]).find(
          (j) =>
            j.status === "running" || j.status === "queued" || j.status === "awaiting-confirm",
        );
        if (!active) return;
        setJob(active);
        if (active.questions) setQuestions(active.questions);
        if (active.status === "awaiting-confirm") {
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
  }, [startPolling]);

  /** 发起押题 */
  async function start(payload: InterviewStartPayload) {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { kind: payload.kind, resumeId: payload.resumeId } }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body?.error ?? "创建押题任务失败");
        return;
      }
      setJob(body.job);
      setQuestions([]);
      setStarred({});
      setPhase("running");
      startPolling(body.job.id);
    } catch {
      setError("网络错误,请稍后重试");
    } finally {
      setStarting(false);
    }
  }

  /** 放弃正在跑的任务 */
  async function discard() {
    if (job) {
      await fetch(`/api/interview/${job.id}`, { method: "DELETE" }).catch(() => {});
    }
    stopPolling();
    setJob(null);
    setQuestions([]);
    setStarred({});
    setError(null);
    setPhase("source");
  }

  /**
   * 再押一套:回到来源选择,但**不删掉上一套**。
   *
   * 这一版还没入库,题目只活在内存里 —— 删了就再也看不回来了。
   * 留着它,用户离开再回来时 GET /api/interview 还能把上一套接上。
   */
  function again() {
    setPhase("source");
  }

  /** 题卡按难度升序 —— 前面偏基础,后面偏深挖 */
  const sorted = [...questions].sort((a, b) => a.difficulty - b.difficulty);

  return (
    <div className={styles.iwWorkspace}>
      {error && (
        <div className={styles.iwErrorBar} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}

      {phase === "source" && (
        <SourcePicker resumes={resumes} busy={starting} onStart={start} />
      )}

      {phase === "running" && job && (
        <ProgressPanel job={job} onDiscard={discard} />
      )}

      {phase === "result" && job && (
        <div className={styles.iwResult}>
          {job.engineNote && (
            <div className={`${styles.iwNotice} ${styles.iwNoticeFallback}`} role="status">
              <span>{job.engineNote}</span>
            </div>
          )}

          {sorted.length < EXPECTED_COUNT && (
            <div className={styles.iwNotice} role="status">
              <span>本次只出了 {sorted.length} 道题 —— 数量以模型实际给出的为准,没有硬凑。</span>
            </div>
          )}

          <div className={styles.iwResultHead}>
            <div>
              <h2 className={styles.iwResultTitle}>押题完成</h2>
              <p className={styles.iwResultSub}>
                共 {sorted.length} 道题,按难度从易到难排。题干常显,参考答案默认收起 ——
                先自己答一遍,答不出来再翻开对。
              </p>
            </div>
            <button type="button" className={styles.iwGhostBtn} onClick={again}>
              再押一套
            </button>
          </div>

          <div className={styles.iwCardList}>
            {sorted.map((q, i) => (
              <QuestionCard
                key={`${job.id}-${i}`}
                question={q.question}
                answer={q.answer}
                difficulty={q.difficulty}
                category={q.category}
                topic={q.topic}
                starred={Boolean(starred[i])}
                starMode="focus"
                onStarChange={(next) => setStarred((s) => ({ ...s, [i]: next }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default InterviewWorkspace;
