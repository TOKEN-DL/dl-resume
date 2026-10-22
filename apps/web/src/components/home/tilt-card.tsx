"use client";

/**
 * TiltCard —— 鼠标移上去时卡片做一点 3D 倾斜。
 *
 * 和首页 Hero 的 3D 场景呼应:同一套语言,轻量版。
 * 变换直接写在 DOM style 上,不走 React state —— 指针事件很密,
 * 每帧 re-render 没必要。
 */

import { useRef } from "react";
import styles from "./tilt-card.module.css";

export function TiltCard({
  children,
  className,
  max = 8,
}: {
  children: React.ReactNode;
  className?: string;
  /** 最大倾斜角度(度) */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
  }

  function onPointerLeave() {
    const el = ref.current;
    if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div
      ref={ref}
      className={`${styles.tilt} ${className ?? ""}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>
  );
}

export default TiltCard;
