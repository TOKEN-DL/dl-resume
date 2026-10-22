"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 进入视口检测 —— 模板库缩略图懒加载用。
 *
 * 语义:
 *   - 元素进入视口附近(rootMargin)时返回 true,离开时返回 false。
 *     **不是**「进入过就一直 true」——每套模板的缩略图都是完整的 A4 页面 DOM,
 *     全部永久挂载会把浏览器的布局/绘制压垮(实测滚动直接卡死),
 *     所以离开范围就卸载,滚回来再挂。
 *   - 浏览器不支持 IntersectionObserver 时直接放行(降级为一次性渲染)。
 *   - 服务端渲染时 effect 不执行,恒为 false —— 首屏只出占位骨架。
 */
export function useInView<T extends HTMLElement>(
  ref: RefObject<T | null>,
  /** 视口外多少像素内仍算"在范围内"。越大预渲染越早,但同时挂载的模板越多。 */
  rootMargin = "400px 0px",
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) setInView(e.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return inView;
}
