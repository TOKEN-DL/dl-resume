"use client";

/**
 * 题卡 —— 「面试押题」页与「我的题库」页共用的展示单元。
 *
 * 一条硬规则:**题干永远可见,参考答案默认收起**。
 * 用户先自己答,答不出来再点「看参考答案」;所以折叠态**一个字的答案都不许露**
 * (不显示摘要,答案只整段出现),免得一眼瞥到要点就泄了题。
 *
 * 折叠不用原生 `<details>`:那个元素的展开态样式不好控,也不符合仓库既有组件
 * 的写法。这里用受控 disclosure —— 一个 `button` + `aria-expanded`,
 * 答案区用 `aria-controls` 跟按钮挂钩。
 *
 * 星级在两个页面语义不同,由 `starMode` 决定:
 *   - 押题页(`focus`)=「重点关注」:题还没入库,勾中的在确认入库时落成 `starred`
 *   - 题库页(`favorite`)=「收藏 / 取消收藏」:当场生效并持久化
 *
 * 两种用法共用同一套 props:
 *   - **本地 state 驱动**(押题页):父组件用 useState 记着勾没勾,把 `starred`
 *     传进来,`onStarChange` 里更新它;
 *   - **接口回写驱动**(题库页):父组件把服务端返回的 `starred` 传进来,
 *     `onStarChange` 里发 PATCH,回写成功后新的 `starred` 再传回来。
 *
 * 星级状态以 props 为准,但点击会**先乐观翻转**再通知父组件 —— 接口往返的
 * 那一小段时间里,用户不用盯着一个没反应的按钮。props 一旦真的变了,以 props 为准
 * (包括父组件回滚)。
 */
import { useId, useState } from "react";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  normalizeDifficulty,
  type QuestionCategory,
  type QuestionDifficulty,
} from "@/lib/interview/difficulty";
import styles from "./interview.module.css";

/** 星级语义:押题页「重点关注」/ 题库页「收藏」 */
export type QuestionStarMode = "focus" | "favorite";

export interface QuestionCardProps {
  /** 题干 —— 永远可见 */
  question: string;
  /** 参考答案 —— 默认收起,点开才整段出现 */
  answer: string;
  /** 难度档 1-4(超出范围会夹到边界) */
  difficulty: number;
  /** 分类 basic / deep;认不出来的原样显示,不静默吞掉 */
  category: string;
  /** 考点关键词 */
  topic: string;
  /** 星级(收藏 / 重点关注)当前状态 —— 状态由 props 决定 */
  starred: boolean;
  /** 星级切换回调,传出**新的**收藏状态 */
  onStarChange?: (next: boolean) => void;
  /** 星级语义。默认 `favorite`(题库页那套) */
  starMode?: QuestionStarMode;
  /** 答案是否默认展开。默认 false —— 默认收起 */
  defaultOpen?: boolean;
  /** 透传到根节点的 className */
  className?: string;
}

/** 分类认得出来就是 basic / deep,认不出来返回 null(调用方原样显示) */
function normalizeCategory(value: string): QuestionCategory | null {
  return value === "basic" || value === "deep" ? value : null;
}

/**
 * 每档难度对应哪个类名。
 *
 * 写成静态表而不是按档位拼类名(`qcDiff${level}`):拼出来的那一档要是没在 CSS 里
 * 定义,拿到的是 undefined,className 里就会冒出个 "undefined"。静态表在类型层面
 * 就是穷尽的 —— 加档位忘了加类名,tsc 就会拦下来。
 */
const DIFFICULTY_CLASS: Record<QuestionDifficulty, string> = {
  1: styles.qcDiff1,
  2: styles.qcDiff2,
  3: styles.qcDiff3,
  4: styles.qcDiff4,
};

export function QuestionCard({
  question,
  answer,
  difficulty,
  category,
  topic,
  starred,
  onStarChange,
  starMode = "favorite",
  defaultOpen = false,
  className,
}: QuestionCardProps) {
  // React 的 useId 带的是 `«r0»` / `:r0:` 这类字符,清一遍再拼,
  // 保证它是个合法(也能被 CSS 选择器命中的)HTML id。
  const answerId = `qc-answer-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const [open, setOpen] = useState(defaultOpen);

  /**
   * 星级:点击时先乐观翻转,再通知父组件;
   * props 里的 starred 真的变了,就以 props 为准(父组件回滚也跟得上)。
   */
  const [starState, setStarState] = useState(starred);
  const [lastStarred, setLastStarred] = useState(starred);
  if (starred !== lastStarred) {
    setLastStarred(starred);
    setStarState(starred);
  }

  const level = normalizeDifficulty(difficulty);
  const cat = normalizeCategory(category);

  function toggleStar() {
    const next = !starState;
    setStarState(next);
    onStarChange?.(next);
  }

  const starText =
    starMode === "focus"
      ? starState
        ? "取消重点关注"
        : "重点关注"
      : starState
        ? "取消收藏"
        : "收藏";

  const rootClass = className ? `${styles.qcCard} ${className}` : styles.qcCard;

  return (
    <article className={rootClass}>
      <div className={styles.qcHead}>
        <div className={styles.qcTags}>
          <span
            className={`${styles.qcTag} ${styles.qcDiff} ${DIFFICULTY_CLASS[level]}`}
          >
            {DIFFICULTY_LABELS[level]}
          </span>
          <span className={styles.qcSep} aria-hidden="true">
            ·
          </span>
          <span className={styles.qcTag}>{cat ? CATEGORY_LABELS[cat] : category}</span>
          <span className={styles.qcSep} aria-hidden="true">
            ·
          </span>
          <span className={`${styles.qcTag} ${styles.qcTopic}`}>
            <span className={styles.qcTopicLabel}>考点</span>
            <span className={styles.qcTopicValue}>{topic}</span>
          </span>
        </div>

        <button
          type="button"
          className={starState ? `${styles.qcStar} ${styles.qcStarOn}` : styles.qcStar}
          aria-pressed={starState}
          onClick={toggleStar}
        >
          <span className={styles.qcStarGlyph} aria-hidden="true">
            {starState ? "★" : "☆"}
          </span>
          <span>{starText}</span>
        </button>
      </div>

      <p className={styles.qcQuestion}>{question}</p>

      <button
        type="button"
        className={styles.qcToggle}
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={open ? `${styles.qcCaret} ${styles.qcCaretOpen}` : styles.qcCaret}
          aria-hidden="true"
        >
          ▸
        </span>
        <span>看参考答案</span>
      </button>

      {/* 收起时答案整段都不在 DOM 里 —— 不能只藏起来,那样一眼就瞥到了 */}
      {open && (
        <div id={answerId} role="region" aria-label="参考答案" className={styles.qcAnswer}>
          {answer.trim() ? answer : "参考答案生成失败"}
        </div>
      )}
    </article>
  );
}

export default QuestionCard;
