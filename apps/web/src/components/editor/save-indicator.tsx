/**
 * 自动保存状态指示器.
 * idle | dirty | saving | saved | error
 */
"use client";

import type { SaveState } from "./use-local-draft";
import styles from "./save-indicator.module.css";

interface Props {
  state: SaveState;
  lastSavedAt: number | null;
  onFlush: () => void;
}

const COPY: Record<SaveState, string> = {
  idle: "已同步",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已同步",
  error: "保存失败 — 点重试",
};

export function SaveIndicator({ state, lastSavedAt, onFlush }: Props) {
  return (
    <div className={`${styles.box} ${styles[`state_${state}`]}`}>
      <span className={styles.dot} />
      <span className={styles.text}>{COPY[state]}</span>
      {state === "dirty" && (
        <button type="button" onClick={onFlush} className={styles.btn}>立即保存</button>
      )}
      {state === "error" && (
        <button type="button" onClick={onFlush} className={styles.btn}>重试</button>
      )}
      {lastSavedAt && state !== "saving" && (
        <span className={styles.time}>{formatTime(lastSavedAt)}</span>
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}