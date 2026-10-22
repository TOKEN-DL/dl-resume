"use client";

/**
 * 导航栏里的后台任务指示器。
 *
 * 优化是在服务端跑的,用户切到别的页面后,顶栏要一直让他知道
 * 「那边还在跑 / 有结果等你确认」,并且能一键回到那个任务。
 *
 * 没在跑的时候不渲染任何东西 —— 顶栏保持干净。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/optimize/stages";
import type { JobSummary } from "@/lib/optimize/types";
import styles from "./optimize-badge.module.css";

/** 有任务在跑时 2 秒一跳,空闲时 6 秒一跳(不用白耗流量) */
const BUSY_POLL_MS = 2000;
const IDLE_POLL_MS = 6000;

/** 任务有变化时广播一下 —— 新建任务后指示器要立刻亮起来,不能等下一轮轮询 */
export const OPTIMIZE_CHANGED_EVENT = "optimize:changed";

export function OptimizeBadge() {
  const [job, setJob] = useState<JobSummary | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      let next = IDLE_POLL_MS;
      try {
        const r = await fetch("/api/optimize", { cache: "no-store" });
        if (r.ok) {
          const { jobs } = await r.json();
          const active = (jobs as JobSummary[]).find(
            (j) =>
              j.status === "running" ||
              j.status === "queued" ||
              j.status === "awaiting-confirm",
          );
          if (!alive) return;
          setJob(active ?? null);
          if (active) next = BUSY_POLL_MS;
        }
      } catch {
        /* 网络抖动就按空闲节奏重试 */
      }
      if (alive) timer = setTimeout(poll, next);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, 0);
    };

    poll();

    // 有人在别处新建了任务 —— 立刻重新查一次,别等下一轮
    window.addEventListener(OPTIMIZE_CHANGED_EVENT, schedule);
    return () => {
      alive = false;
      window.removeEventListener(OPTIMIZE_CHANGED_EVENT, schedule);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!job) return null;

  const done = job.stages.filter((s) => s.status === "done").length;
  const awaiting = job.status === "awaiting-confirm";

  return (
    <Link href="/optimize" className={styles.badge} title={job.title}>
      <span className={`${styles.dot} ${awaiting ? styles.dotDone : ""}`} aria-hidden="true" />
      <span className={styles.text}>
        {awaiting ? "优化待确认" : `优化中 ${done}/${STAGES.length}`}
      </span>
    </Link>
  );
}

export default OptimizeBadge;
