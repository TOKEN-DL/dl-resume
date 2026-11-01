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
 * 跑完之后停在「待确认入库」这个节点:题卡先给用户看,勾的「重点关注」
 * 先记在本地 state 里;确认入库时把这些序号一起递给后端,入库后直接落成收藏。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  /** 「重点关注」按题目在 job.questions 里的下标记 —— 入库时要按这个下标落到对应的题上 */
  const [starred, setStarred] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** 二次确认层是否打开 */
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** 正在写入题库 */
  const [confirming, setConfirming] = useState(false);
  /** 预览出来的「会入库几题 / 会跳过几题」—— null 表示还在算 */
  const [plan, setPlan] = useState<{ inserted: number; skipped: number } | null>(null);
  /** 预览没算出来 —— 不挡确认,只是这一层报不出准确的重复题数 */
  const [planFailed, setPlanFailed] = useState(false);
  /** 入库回执 —— 用来显示「已入库 N 题 → 去题库」 */
  const [saved, setSaved] = useState<{ inserted: number; skipped: number } | null>(null);
  /**
   * 跨套判重的拦截信息(#22)。
   *
   * 任务里存着生成时算好的结论;入库时服务端又算了一遍(题库可能变了),
   * 以服务端返回的为准。
   */
  const [dupBlock, setDupBlock] = useState<{
    duplicateCount: number;
    totalCount: number;
    matchedSetTitle: string | null;
  } | null>(null);
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
      setSaved(null);
      setDupBlock(null);
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
    setSaved(null);
    setDupBlock(null);
    setError(null);
    setPhase("source");
  }

  /**
   * 再押一套:回到来源选择,但**不删掉上一套**。
   *
   * 入库过的题目已经在题库里了(去题库页能看见),这里只是回到来源选择,
   * 好开下一套。
   */
  function again() {
    setSaved(null);
    setPhase("source");
  }

  /** 勾了「重点关注」的题目序号 —— 对应 job.questions 里的下标 */
  const starredIndexes = useMemo(
    () =>
      Object.entries(starred)
        .filter(([, on]) => on)
        .map(([k]) => Number(k))
        .filter((n) => Number.isInteger(n) && n >= 0),
    [starred],
  );

  /**
   * 跨套判重的拦截结论 —— 整套高度重复时,整套不入库。
   *
   * 优先用服务端刚返回的(入库时算的那一遍),没有就用任务里生成时算好的。
   */
  const dup = useMemo(() => {
    if (dupBlock) return dupBlock;
    const d = job?.dedupe;
    if (!d?.isDuplicate) return null;
    return {
      duplicateCount: d.duplicateCount,
      totalCount: d.totalCount,
      matchedSetTitle: d.matchedSet?.title ?? null,
    };
  }, [dupBlock, job?.dedupe]);

  /** 「仍要入库」能留下几题 */
  const keepCount = dup ? Math.max(0, dup.totalCount - dup.duplicateCount) : 0;

  /**
   * 打开二次确认层。
   *
   * 先向服务端要一次「预览」—— 有几题会入库、有几题是库里已有的重复题。
   * 重复题数只有服务端算得准(指纹归一化在服务端那侧),前端不许瞎编一个数。
   */
  async function openConfirm() {
    if (!job) return;
    setConfirmOpen(true);
    setPlan(null);
    setPlanFailed(false);
    try {
      const r = await fetch(`/api/interview/${job.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      if (!r.ok) {
        setPlanFailed(true);
        return;
      }
      const body = await r.json();
      setPlan({ inserted: body.inserted ?? 0, skipped: body.skipped ?? 0 });
    } catch {
      setPlanFailed(true);
    }
  }

  /** 关掉二次确认层 —— 不写库,任务还能再确认 */
  function cancelConfirm() {
    setConfirmOpen(false);
    setPlan(null);
    setPlanFailed(false);
  }

  /**
   * 确认入库。
   *
   * 把「重点关注」的题目序号一起递上去 —— 入库时这些题直接落成收藏。
   * 重复点确认不会写第二份:服务端认得这个任务已经入过库,直接把上次的
   * 结果原样返回。
   *
   * force:用户点了「仍要入库」—— 整套被判高度重复时,由用户拍板,
   * 只写入不重复的那几题。
   */
  async function doConfirm(force = false) {
    if (!job) return;
    setConfirming(true);
    try {
      const r = await fetch(`/api/interview/${job.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starredIndexes, ...(force ? { force: true } : {}) }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (body?.error === "set_duplicate") {
          // 服务端算出来的重复率更高 —— 把结论搬上提示条,让用户拍板
          setDupBlock({
            duplicateCount: body.duplicateCount ?? 0,
            totalCount: body.totalCount ?? 0,
            matchedSetTitle: body.matchedSet?.title ?? null,
          });
          // 关掉二次确认层 —— 提示条上的「仍要入库」才是下一步
          setConfirmOpen(false);
          setPlan(null);
          setPlanFailed(false);
          setError("这套与题库里已有的题高度重复 —— 要入库就点「仍要入库」,只保留不重复的题。");
          return;
        }
        setError(
          body?.error === "all_duplicate"
            ? "这套题全部与题库重复,没有可入库的题。"
            : (body?.error ?? "入库失败,请重试"),
        );
        return;
      }
      setConfirmOpen(false);
      setPlan(null);
      setPlanFailed(false);
      setSaved({ inserted: body.inserted ?? 0, skipped: body.skipped ?? 0 });
    } catch {
      setError("网络错误,入库没有完成,请重试");
    } finally {
      setConfirming(false);
    }
  }

  /**
   * 题卡按难度升序 —— 前面偏基础,后面偏深挖。
   *
   * 连着原始下标一起排:「重点关注」记的是 job.questions 里的下标,
   * 入库时要按这个下标落到对应的题上,不能拿排序后的位置去对。
   */
  const sorted = useMemo(
    () =>
      questions
        .map((q, index) => ({ q, index }))
        .sort((a, b) => a.q.difficulty - b.q.difficulty),
    [questions],
  );

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

          {dup && !saved && (
            <div className={styles.dpBanner} role="alert">
              <div className={styles.dpBannerBody}>
                <p className={styles.dpBannerTitle}>这套与题库里已有的题高度重复</p>
                <p className={styles.dpBannerText}>
                  {dup.matchedSetTitle ? `与《${dup.matchedSetTitle}》那套` : "与题库里已有的题"}
                  重复了 {dup.duplicateCount} / {dup.totalCount} 题 —— 默认整套不入库。
                </p>
              </div>
              <button
                type="button"
                className={styles.dpBtn}
                onClick={() => doConfirm(true)}
                disabled={confirming}
              >
                仍要入库（只保留不重复的 {keepCount} 题）
              </button>
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
            {sorted.map(({ q, index }) => (
              <QuestionCard
                key={`${job.id}-${index}`}
                question={q.question}
                answer={q.answer}
                difficulty={q.difficulty}
                category={q.category}
                topic={q.topic}
                starred={Boolean(starred[index])}
                starMode="focus"
                onStarChange={(next) => setStarred((s) => ({ ...s, [index]: next }))}
              />
            ))}
          </div>

          {!saved ? (
            <div className={styles.cfBar}>
              <p className={styles.cfHint}>
                {dup
                  ? `整套高度重复,默认不入库 —— 要入库就点上面的「仍要入库」,只保留不重复的 ${keepCount} 题。`
                  : `入库后这 ${sorted.length} 道题就进题库了;勾了「重点关注」的会直接落成收藏。`}
              </p>
              {!dup && (
                <button type="button" className={styles.cfPrimaryBtn} onClick={openConfirm}>
                  确认入库题库
                </button>
              )}
            </div>
          ) : (
            <div className={styles.cfDone} role="status">
              <span>
                已入库 {saved.inserted} 题
                {saved.skipped > 0 ? ` / 跳过 ${saved.skipped} 道重复题` : ""} →
              </span>
              <Link href="/questions" className={styles.cfDoneLink}>
                去题库
              </Link>
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          className={styles.cfOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="确认入库题库"
        >
          <div className={styles.cfDialog}>
            <h3 className={styles.cfDialogTitle}>确认入库题库</h3>

            {plan ? (
              <p className={styles.cfCounts}>
                {plan.inserted} 题入库 / 跳过 {plan.skipped} 题重复
              </p>
            ) : planFailed ? (
              <p className={styles.cfCounts}>
                本次共 {sorted.length} 道题待入库(重复题数没核对上,写完按实际结果算)。
              </p>
            ) : (
              <p className={styles.cfCounts}>正在核对重复题…</p>
            )}

            <div className={styles.cfActions}>
              <button
                type="button"
                className={styles.cfGhostBtn}
                onClick={cancelConfirm}
                disabled={confirming}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.cfPrimaryBtn}
                onClick={() => doConfirm(false)}
                disabled={confirming}
              >
                {confirming ? "入库中…" : "确认入库"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InterviewWorkspace;
