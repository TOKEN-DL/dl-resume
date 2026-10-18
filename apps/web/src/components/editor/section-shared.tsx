/**
 * 编辑器共享 UI:Section 头部 + 字段 + 数组项卡片 + 排序按钮.
 */
"use client";

import { useId, type ReactNode } from "react";
import styles from "./section.module.css";

export function Section({ title, hint, children, defaultOpen = true }: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{title}</span>
        {hint && <span className={styles.sectionHint}>{hint}</span>}
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </div>
      {children}
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${styles.input} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select {...props} className={`${styles.input} ${props.className ?? ""}`} />;
}

export type PeriodLike = { start?: string; end?: string; current?: boolean };

export function PeriodFields({
  period,
  onChange,
}: {
  period: PeriodLike;
  onChange: (p: PeriodLike) => void;
}) {
  return (
    <div className={styles.periodRow}>
      <input
        className={styles.input}
        type="text"
        placeholder="开始 (YYYY-MM)"
        value={period.start ?? ""}
        onChange={(e) => onChange({ ...period, start: e.target.value })}
      />
      <span className={styles.dash}>—</span>
      <input
        className={styles.input}
        type="text"
        placeholder="结束 (YYYY-MM)"
        value={period.end ?? ""}
        onChange={(e) => onChange({ ...period, end: e.target.value })}
        disabled={period.current}
      />
      <label className={styles.currentBox}>
        <input
          type="checkbox"
          checked={!!period.current}
          onChange={(e) => onChange({ ...period, current: e.target.checked, end: e.target.checked ? "" : (period.end ?? "") })}
        />
        <span>至今</span>
      </label>
    </div>
  );
}

export function ItemCard({
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  title,
  children,
}: {
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.itemCard}>
      <div className={styles.itemHead}>
        <span className={styles.itemTitle}>{title ?? "项目"}</span>
        <div className={styles.itemActions}>
          <button type="button" title="上移" disabled={!canMoveUp} onClick={onMoveUp} className={styles.iconBtn}>↑</button>
          <button type="button" title="下移" disabled={!canMoveDown} onClick={onMoveDown} className={styles.iconBtn}>↓</button>
          <button type="button" title="删除" onClick={onRemove} className={`${styles.iconBtn} ${styles.iconBtnDanger}`}>×</button>
        </div>
      </div>
      <div className={styles.itemBody}>{children}</div>
    </div>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={styles.addBtn}>
      + {label}
    </button>
  );
}