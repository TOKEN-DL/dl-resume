"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 进入视口检测 —— 模板库缩略图懒加载用。
 *
 * 语义:
 *   - 首次进入视口(带 300px 预加载边距)后置 true,并断开观察;
 *     之后不再回退为 false,避免来回滚动时反复卸载 / 重建真实 A4 DOM。
 *   - 浏览器不支持 IntersectionObserver 时直接放行(降级为一次性渲染)。
 *   - 服务端渲染时 effect 不执行,恒为 false —— 首屏只出占位骨架。
 */
export function useInView<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
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
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return inView;
}
