"use client";

/**
 * HeroScene —— 首页门面的 3D 场景。
 *
 * 一组真实模板(不是假缩略图)排成 coverflow:
 *   · 中间一张正对镜头,左右两张带 rotateY 侧身退到景深里
 *   · 每 3.4s 自动换一张,鼠标移上去暂停
 *   · 鼠标在场景里移动时,整个舞台做小幅视差倾斜
 *   · 系统开了「减少动态效果」时,自动轮播与漂浮动画全部关掉
 *
 * 全部用 CSS 3D(perspective / preserve-3d / transform)实现,
 * 不引 three.js —— 门面页不值得为了一段 hero 动画背上整个 3D 引擎。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { TemplateRenderer } from "@/components/editor/template-renderer";
import type { TemplateDef } from "@/lib/templates/types";
import styles from "./hero-scene.module.css";

/** 自动轮播间隔(ms) */
const AUTO_MS = 3400;

/**
 * 漂浮标签的文字与出场顺序。
 * 位置(x / y / z)写在 CSS 里(见 hero-scene.module.css 的 .chip[data-chip]),
 * 这样窄屏能用 media query 单独收紧,不至于飘出画面。
 */
const CHIPS = [
  { text: "结构化分块编辑", delay: 0 },
  { text: "实时预览", delay: 0.9 },
  { text: "客户端 PDF 导出", delay: 1.8 },
  { text: "AES-256 加密", delay: 2.6 },
  { text: "82 套模板", delay: 3.4 },
] as const;

export function HeroScene({ templates }: { templates: TemplateDef[] }) {
  const count = templates.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const tiltRef = useRef<HTMLDivElement | null>(null);

  // 尊重系统「减少动态效果」
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // 自动轮播 —— 鼠标悬停时暂停
  useEffect(() => {
    if (paused || reduceMotion || count < 2) return;
    const id = window.setInterval(() => setActive((v) => (v + 1) % count), AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, reduceMotion, count]);

  // 鼠标视差 —— 直接写 DOM transform,不走 React state,避免每帧重渲染
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = tiltRef.current;
    if (!el || reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `rotateX(${(-ny * 9).toFixed(2)}deg) rotateY(${(nx * 13).toFixed(2)}deg)`;
  }

  function resetTilt() {
    const el = tiltRef.current;
    if (el) el.style.transform = "rotateX(0deg) rotateY(0deg)";
  }

  const cards = useMemo(
    () =>
      templates.map((def, i) => {
        const d = shortestOffset(i, active, count);
        const abs = Math.abs(d);
        return {
          def,
          d,
          abs,
          style: {
            // 卡间距用 CSS 变量算,窄屏时由 media query 收紧
            transform: `translate3d(calc(var(--card-gap) * ${d}), 0, ${70 - abs * 145}px) rotateY(${d * 30}deg)`,
            opacity: abs >= 3 ? 0 : 1 - abs * 0.22,
            zIndex: 20 - abs,
          },
        };
      }),
    [templates, active, count],
  );

  if (count === 0) return null;

  const current = templates[active] ?? templates[0];

  return (
    <div
      className={styles.scene}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-scene="hero"
    >
      <div className={styles.viewport}>
        <div className={styles.tilt} ref={tiltRef}>
          <div className={styles.stage}>
            <div className={styles.floor} aria-hidden="true" />

            {cards.map((c) => (
              <div
                key={c.def.id}
                className={`${styles.card} ${c.abs === 0 ? styles.cardCenter : ""}`}
                style={c.style}
                data-scene-card={c.def.id}
                aria-hidden="true"
              >
                <div className={styles.page}>
                  <TemplateRenderer def={c.def} data={c.def.sample} />
                </div>
              </div>
            ))}

            {CHIPS.map((chip, i) => (
              <span
                key={chip.text}
                className={styles.chip}
                data-chip={i}
                aria-hidden="true"
              >
                <span
                  className={styles.chipBody}
                  style={{
                    animationDelay: `${chip.delay}s`,
                    animationPlayState: reduceMotion ? "paused" : "running",
                  }}
                >
                  {chip.text}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.caption}>
        <div className={styles.captionText}>
          <span className={styles.captionName}>{current.name}</span>
          <span className={styles.captionSummary}>{current.summary}</span>
        </div>
        <div className={styles.dots}>
          {templates.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.dot} ${i === active ? styles.dotActive : ""}`}
              aria-label={t.name}
              aria-current={i === active}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 卡片的相对位移(环形取最短路径)。
 * 5 张时:active=0 → 偏移依次是 0,1,2,-2,-1。
 */
function shortestOffset(i: number, active: number, count: number): number {
  if (count <= 0) return 0;
  let d = i - active;
  const half = count / 2;
  if (d > half) d -= count;
  if (d < -half) d += count;
  return d;
}

export default HeroScene;
