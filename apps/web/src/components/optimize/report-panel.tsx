"use client";

/**
 * 报告面板 —— 优化跑完后的确认界面。
 *
 * 用户在这里做三件事:
 *   1. 看总体评分与每个模块的分数
 *   2. 看每一条问题是什么问题、要怎么改(能自动改的直接给前后对照)
 *   3. 确认后才写入简历历史
 */
import { useMemo, useState } from "react";
import { MODULE_LABELS } from "@/lib/optimize/analyzer";
import type { JobSummary, OptimizeReport, PlanItem, Severity } from "@/lib/optimize/types";
import styles from "./optimize.module.css";

const SEVERITY_META: Record<Severity, { label: string; cls: string }> = {
  error: { label: "必须修", cls: "sevError" },
  warn: { label: "建议改进", cls: "sevWarn" },
  info: { label: "可以打磨", cls: "sevInfo" },
};

const GROUPS: Severity[] = ["error", "warn", "info"];

/** 最多展示几处前后对照,其余汇总成一行 */
const MAX_DIFFS = 4;

function scoreClass(score: number): string {
  if (score >= 80) return "scoreGood";
  if (score >= 60) return "scoreFair";
  return "scorePoor";
}

export function ReportPanel({
  job,
  report,
  confirming,
  onConfirm,
  onDiscard,
  onOpenResume,
}: {
  job: JobSummary;
  report: OptimizeReport;
  confirming: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  onOpenResume: (id: string) => void;
}) {
  const [openItem, setOpenItem] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<Severity, PlanItem[]>();
    for (const g of GROUPS) map.set(g, []);
    for (const item of report.plan) map.get(item.severity)?.push(item);
    return map;
  }, [report.plan]);

  /**
   * 同一处改动可能被多条问题引用(比如同一段描述既「没数字」又「以弱动词开头」),
   * 前后对照只展示一次,不然报告会被大段重复的 diff 撑爆。
   *
   * 这里用 useMemo 预先算好「哪条方案负责展示哪处对照」,而不是在渲染里改 Set ——
   * 渲染期改状态在 StrictMode 的双渲染下会把对照吞掉。
   *
   * 另外只展示前 MAX_DIFFS 处,其余的用一行汇总带过:
   * 六段经历各有一条问题,全展开的话报告会有一屏那么长。
   */
  const showDiffMap = useMemo(() => {
    // 每处改动只归第一条提到它的方案
    const owner = new Map<string, string>();
    for (const item of report.plan) {
      const t = item.change?.target;
      if (t && !owner.has(t)) owner.set(t, item.id);
    }
    // 最多展示 MAX_DIFFS 处
    const visible = new Set<string>();
    for (const t of owner.keys()) {
      if (visible.size >= MAX_DIFFS) break;
      visible.add(t);
    }
    const map = new Map<string, boolean>();
    for (const item of report.plan) {
      const t = item.change?.target;
      if (!t) continue;
      map.set(item.id, owner.get(t) === item.id && visible.has(t));
    }
    return map;
  }, [report.plan]);

  /** 有多少处真的被改过 —— 按「处」算,不是按方案条数 */
  const changedCount = useMemo(
    () => new Set(report.plan.map((p) => p.change?.target).filter(Boolean)).size,
    [report.plan],
  );

  return (
    <div className={styles.report}>
      {/* ── 总览 ─────────────────────────────────────────── */}
      <div className={styles.reportHead}>
        <div className={styles.scoreBlock}>
          <div className={`${styles.bigScore} ${scoreClass(report.summary.score)}`}>
            {report.summary.score}
          </div>
          <div className={styles.scoreLabel}>综合评分</div>
        </div>
        <div className={styles.reportHeadMain}>
          <h2 className={styles.reportTitle}>优化完成,下面是体检报告</h2>
          <div className={styles.reportCounts}>
            <span className={styles.sevError}>必须修 {report.summary.errors}</span>
            <span className={styles.sevWarn}>建议改进 {report.summary.warns}</span>
            <span className={styles.sevInfo}>可以打磨 {report.summary.infos}</span>
          </div>
          <div className={styles.engineNote}>
            <span className={styles.engineBadge}>{report.providerLabel}</span>
            {report.engineNote ? <span>{report.engineNote}</span> : null}
          </div>
        </div>
      </div>

      {/* ── 各模块分数 ───────────────────────────────────── */}
      <section className={styles.reportSection}>
        <h3 className={styles.sectionTitle}>各模块评分</h3>
        <div className={styles.moduleGrid}>
          {report.reviews.map((r) => (
            <div key={r.module} className={styles.moduleCell}>
              <div className={styles.moduleRow}>
                <span className={styles.moduleName}>{r.label}</span>
                <span className={`${styles.moduleScore} ${scoreClass(r.score)}`}>
                  {r.score}
                </span>
              </div>
              <div className={styles.moduleTrack}>
                <div
                  className={`${styles.moduleFill} ${scoreClass(r.score)}`}
                  style={{ width: `${r.score}%` }}
                />
              </div>
              {r.findings.length > 0 && (
                <div className={styles.moduleIssues}>{r.findings.length} 个待改进点</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 方案 ─────────────────────────────────────────── */}
      <section className={styles.reportSection}>
        <h3 className={styles.sectionTitle}>
          优化方案
          {changedCount > 0 && (
            <span className={styles.sectionNote}>
              其中 {changedCount} 处已经自动改好,下面能直接看到前后对照
            </span>
          )}
        </h3>

        {GROUPS.map((sev) => {
          const items = grouped.get(sev) ?? [];
          if (items.length === 0) return null;
          const meta = SEVERITY_META[sev];
          /* 本组里被折叠掉的对照数量 —— 按组算,不能全局算,否则每个分组都会重复一行 */
          const groupHidden = items.filter(
            (p) => p.change && !showDiffMap.get(p.id),
          ).length;
          return (
            <div key={sev} className={styles.group}>
              <div className={`${styles.groupTitle} ${styles[meta.cls]}`}>
                {meta.label} · {items.length}
              </div>
              <ul className={styles.planList}>
                {items.map((item) => {
                  const showDiff = showDiffMap.get(item.id) ?? false;
                  return (
                  <li key={item.id} className={styles.planItem}>
                    <button
                      type="button"
                      className={styles.planHead}
                      onClick={() =>
                        setOpenItem(openItem === item.id ? null : item.id)
                      }
                      aria-expanded={openItem === item.id}
                    >
                      <span className={styles.planTitle}>{item.title}</span>
                      <span className={styles.planModule}>
                        {MODULE_LABELS[item.module]}
                      </span>
                      {item.change && (
                        <span className={styles.autoTag}>已自动改</span>
                      )}
                    </button>

                    <div className={styles.planBody}>
                      <p className={styles.planDetail}>{item.detail}</p>
                      <p className={styles.planAction}>
                        <span className={styles.planActionLabel}>怎么改</span>
                        {item.action}
                      </p>

                      {item.change && showDiff && (
                        <div className={styles.diff}>
                          <div className={styles.diffCol}>
                            <div className={styles.diffLabel}>改前</div>
                            <div className={styles.diffText}>
                              {item.change.before || "（空）"}
                            </div>
                          </div>
                          <div className={`${styles.diffCol} ${styles.diffAfter}`}>
                            <div className={styles.diffLabel}>改后</div>
                            <div className={styles.diffText}>
                              {item.change.after || "（空）"}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 对照被折叠时也要说清楚改过了 —— 只留「已自动改写」
                          却不给对照,用户会以为没改 */}
                      {item.change && !showDiff && (
                        <p className={styles.planFolded}>
                          这处已经自动改好,对照见本组末尾的汇总。
                        </p>
                      )}
                    </div>
                  </li>
                  );
                })}
                {groupHidden > 0 && (
                  <li className={styles.diffRest}>
                    还有 {groupHidden} 处同类改动已应用，确认后一起写入。
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── 确认 ─────────────────────────────────────────── */}
      <div className={styles.confirmBar}>
        <div className={styles.confirmText}>
          <div className={styles.confirmTitle}>确认后写入简历历史</div>
          <div className={styles.confirmSub}>
            原简历不会被改动,优化版会作为「{job.title} · 优化版」另存一份。
          </div>
          {job.source.resumeId && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => onOpenResume(job.source.resumeId!)}
            >
              查看原简历
            </button>
          )}
        </div>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.ghostBtn} onClick={onDiscard}>
            放弃
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "正在写入…" : "确认并写入历史"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportPanel;
