"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TemplateRenderer } from "@/components/editor/template-renderer";
import type { ResumeData } from "@/lib/validation/resume";
import type { TemplateDef } from "@/lib/templates/types";
import { useInView } from "./use-in-view";
import styles from "./template-picker.module.css";

/** A4 @96dpi —— 与 components/editor/templates.module.css 的 .preview 保持一致 */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

/**
 * SSR 没有布局,只能用 useEffect;浏览器里改用 useLayoutEffect ——
 * 量宽放在布局阶段完成,首帧就是真缩略图,不会先闪一下灰底。
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 模板缩略图 —— 用**范文 + 真实模板组件**渲染,不是假缩略图。
 *
 * 缩放方式:真实 A4 固定 794px 宽,外层用 `transform: scale(width / 794)` 缩到卡片宽度,
 * `transform-origin: top left`,容器 `overflow: hidden` 裁切。
 *
 * 懒加载:元素进入视口(useInView)才挂载真实 A4 DOM,首屏只出等高占位骨架,
 * 避免一次性渲染几十份 A4 把首屏拖垮。lazy=false 时直接挂载(首屏卡片用)。
 *
 * 内容:默认渲染模板自带的范文;传 data 则渲染这份内容本身
 * (「我的简历」列表用的就是它 —— 卡片里看到的是用户自己的简历)。
 *
 * 宽度:默认随卡片宽度自适应(ResizeObserver 量一次),也可用 width 固定;
 * 容器高度由 `aspect-ratio: 794 / 1123` 决定,等价于 1123 * scale,不会跳动。
 */
export function TemplateThumb({
  def,
  width,
  data,
  lazy = true,
}: {
  def: TemplateDef;
  /** 固定宽度(px);不给则自适应容器宽度 */
  width?: number;
  /** 要渲染的内容;不给则用模板自带的范文 */
  data?: ResumeData;
  /** 是否等进入视口再挂载真实 A4;首屏卡片传 false 可以少一次灰底闪烁 */
  lazy?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  const inView = useInView(frameRef);

  // 量一次容器宽度 —— 网格是 1fr 自适应列,不同视口下缩放比例不一样
  useIsomorphicLayoutEffect(() => {
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
  const visible = lazy ? inView : true;

  return (
    <div
      ref={frameRef}
      className={styles.thumbFrame}
      style={width ? { width } : undefined}
    >
      {visible && scale > 0 ? (
        <div className={styles.thumbScaler} style={{ transform: `scale(${scale})` }}>
          <TemplateRenderer def={def} data={data ?? def.sample} />
        </div>
      ) : (
        <div className={styles.thumbPlaceholder} aria-hidden="true" />
      )}
    </div>
  );
}
