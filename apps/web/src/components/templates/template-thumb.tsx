"use client";

import { useEffect, useRef, useState } from "react";
import { TemplateRenderer } from "@/components/editor/template-renderer";
import type { TemplateDef } from "@/lib/templates/types";
import { useInView } from "./use-in-view";
import styles from "./template-picker.module.css";

/** A4 @96dpi —— 与 components/editor/templates.module.css 的 .preview 保持一致 */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

/**
 * 模板缩略图 —— 用**范文 + 真实模板组件**渲染,不是假缩略图。
 *
 * 缩放方式:真实 A4 固定 794px 宽,外层用 `transform: scale(width / 794)` 缩到卡片宽度,
 * `transform-origin: top left`,容器 `overflow: hidden` 裁切。
 *
 * 懒加载:元素进入视口(useInView)才挂载真实 A4 DOM,首屏只出等高占位骨架,
 * 避免一次性渲染 32 份 A4 把首屏拖垮。
 *
 * 宽度:默认随卡片宽度自适应(ResizeObserver 量一次),也可用 width 固定;
 * 容器高度由 `aspect-ratio: 794 / 1123` 决定,等价于 1123 * scale,不会跳动。
 */
export function TemplateThumb({
  def,
  width,
}: {
  def: TemplateDef;
  /** 固定宽度(px);不给则自适应容器宽度 */
  width?: number;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  const inView = useInView(frameRef);

  // 量一次容器宽度 —— 网格是 1fr 自适应列,不同视口下缩放比例不一样
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const read = () => setMeasured(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxWidth = width ?? measured;
  const scale = boxWidth > 0 ? boxWidth / A4_WIDTH : 0;

  return (
    <div
      ref={frameRef}
      className={styles.thumbFrame}
      style={width ? { width } : undefined}
    >
      {inView && scale > 0 ? (
        <div className={styles.thumbScaler} style={{ transform: `scale(${scale})` }}>
          <TemplateRenderer def={def} data={def.sample} />
        </div>
      ) : (
        <div className={styles.thumbPlaceholder} aria-hidden="true" />
      )}
    </div>
  );
}
