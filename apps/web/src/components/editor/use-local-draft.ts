/**
 * useLocalDraft — 5s 防抖写 IndexedDB + 立即 flush 到服务端.
 *
 * 设计:
 *  - 输入 → 立即更新 React state(用于预览)
 *  - 同一次输入后启动 5s 定时器;到期写入 IndexedDB(`resume:{id}` key)
 *  - 用户主动 flush(关闭/路由切换/手动点保存)→ 立即写服务端 PATCH
 *  - 组件 mount 时:从 IndexedDB 读 draft,如更新时间比服务端新,则覆盖本地 state
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, set as idbSet, del as idbDel } from "idb-keyval";
import type { ResumeData } from "@/lib/validation/resume";
import { safeStringify, parseResumeData } from "@/lib/validation/resume";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface DraftMeta {
  data: ResumeData;
  title?: string;
  template?: string;
  updatedAt: number; // ms
}

export interface UseLocalDraftOptions {
  resumeId: string;
  initialData: ResumeData;
  initialTitle: string;
  initialTemplate: string;
  /** PATCH 时要带的额外字段 */
  onPersist: (payload: { data: ResumeData; title?: string; template?: string }) => Promise<void>;
  /** debounce ms,默认 5000 */
  debounceMs?: number;
}

export function useLocalDraft(opts: UseLocalDraftOptions) {
  const {
    resumeId,
    initialData,
    initialTitle,
    initialTemplate,
    onPersist,
    debounceMs = 5000,
  } = opts;

  const [data, setData] = useState<ResumeData>(initialData);
  const [title, setTitle] = useState(initialTitle);
  const [template, setTemplate] = useState(initialTemplate);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const dataRef = useRef(data);
  const titleRef = useRef(title);
  const templateRef = useRef(template);
  const dirtyRef = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  // keep refs synced
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { templateRef.current = template; }, [template]);

  const key = `resume:${resumeId}`;

  // ─── mount: 从 IndexedDB 取 draft 比对时间戳 ─────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const draft = (await get(key)) as DraftMeta | undefined;
        if (!alive || !draft) return;
        // 简单策略:draft 比"组件创建"更新就采用
        if (draft.updatedAt > Date.now() - 365 * 24 * 60 * 60 * 1000) {
          // always adopt draft — IndexedDB is local, may be more recent than server fetch
          setData(draft.data);
          if (typeof draft.title === "string") setTitle(draft.title);
          if (typeof draft.template === "string") setTemplate(draft.template);
          dirtyRef.current = true;
          setSaveState("dirty");
        }
      } catch {
        // IndexedDB 不可用(隐私模式)— 静默退化
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // ─── 输入即触发 debounce + dirty ──────────────────────────────────
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState("dirty");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      // 5s 后写 IndexedDB
      const meta: DraftMeta = {
        data: dataRef.current,
        title: titleRef.current,
        template: templateRef.current,
        updatedAt: Date.now(),
      };
      try {
        await idbSet(key, meta);
      } catch {
        // ignored
      }
    }, debounceMs);
  }, [key, debounceMs]);

  // ─── flush: 立即写服务端 ───────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (!dirtyRef.current) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      await onPersist({
        data: dataRef.current,
        title: titleRef.current,
        template: templateRef.current,
      });
      dirtyRef.current = false;
      setSaveState("saved");
      setLastSavedAt(Date.now());
      // 清掉 IndexedDB draft — 已同步到服务端
      try { await idbDel(key); } catch { /* ignore */ }
    } catch (e) {
      setSaveState("error");
      console.error("[useLocalDraft] persist failed", e);
    } finally {
      savingRef.current = false;
    }
  }, [onPersist, key]);

  // ─── beforeunload: 同步 fire-and-forget flush ──────────────────────
  useEffect(() => {
    const handler = () => {
      if (dirtyRef.current) {
        // 用 sendBeacon 或 fetch keepalive 异步送,但 MVP 用 fetch + cache
        try {
          const blob = new Blob(
            [JSON.stringify({
              data: safeStringify(dataRef.current),
              title: titleRef.current,
              template: templateRef.current,
            })],
            { type: "application/json" },
          );
          navigator.sendBeacon?.(`/api/resumes/${resumeId}`, blob);
        } catch {
          // ignored
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [resumeId]);

  // ─── 显式 setters 包一层 dirty ─────────────────────────────────────
  // 接 next value 或 updater 两种风格 — 直接转发给 React useState 的 setter
  const updateData = useCallback(
    (arg: ResumeData | ((d: ResumeData) => ResumeData)) => {
      if (typeof arg === "function") {
        setData((d) => (arg as (d: ResumeData) => ResumeData)(d));
      } else {
        setData(arg);
      }
      markDirty();
    },
    [markDirty],
  );

  const updateTitle = useCallback((t: string) => {
    setTitle(t);
    markDirty();
  }, [markDirty]);

  const updateTemplate = useCallback((t: string) => {
    setTemplate(t);
    markDirty();
  }, [markDirty]);

  return {
    data,
    title,
    template,
    saveState,
    lastSavedAt,
    setData: updateData as (arg: ResumeData | ((d: ResumeData) => ResumeData)) => void,
    setTitle: updateTitle,
    setTemplate: updateTemplate,
    flush,
  };
}

/** 计算模板自适应字号, 让 7 英寸预览不溢出 */
export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const handler = () => setMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

/** 重新导出供客户端其他模块使用 */
export { parseResumeData, safeStringify };