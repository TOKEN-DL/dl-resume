/**
 * useLocalDraft — 5s 防抖写 IndexedDB + 立即 flush 到服务端.
 *
 * 设计:
 *  - 输入 → 立即更新 React state(用于预览)
 *  - 同一次输入后启动 5s 定时器;到期写入 IndexedDB(`resume:{id}` key)
 *  - 用户主动 flush(关闭/路由切换/手动点保存)→ 立即写服务端
 *  - 组件 mount 时:从 IndexedDB 读 draft,**仅当草稿确实比服务端数据更新时才采用**
 *
 * 保存链路(三层,从快到慢):
 *  1. state            — 实时,驱动预览
 *  2. IndexedDB (5s)   — 崩溃/断网兜底
 *  3. 服务端 (flush)   — 权威副本
 *
 * 关键约束:任何一层失败都不能让用户丢数据,所以
 *  - flush 失败 → IndexedDB 草稿保留,下次打开可恢复
 *  - 草稿比服务端旧 → 丢弃草稿,采用服务端(避免陈旧草稿覆盖真实内容)
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
  /** 服务端已保存数据的更新时间(ms)。草稿比它旧就不采用 — 见下方 serverTimestampMs */
  initialSavedAt?: number;
  /** PATCH 时要带的额外字段 */
  onPersist: (payload: { data: ResumeData; title?: string; template?: string }) => Promise<void>;
  /** debounce ms,默认 5000 */
  debounceMs?: number;
}

/** 草稿比服务端旧多久就作废(ms)。默认 7 天,防止陈旧草稿复活覆盖真实内容。 */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function useLocalDraft(opts: UseLocalDraftOptions) {
  const {
    resumeId,
    initialData,
    initialTitle,
    initialTemplate,
    initialSavedAt,
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

  // ─── mount: 从 IndexedDB 取 draft,仅当比服务端新才采用 ─────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const draft = (await get(key)) as DraftMeta | undefined;
        if (!alive || !draft) return;

        // 服务端基准时间;服务端没给就用组件挂载时刻(保守:草稿此时都算"更旧")
        const serverAt = initialSavedAt ?? Date.now();
        const draftAge = Date.now() - draft.updatedAt;

        // 判定 1:草稿必须比服务端数据新(否则草稿是过期残留,会覆盖真实内容)
        // 判定 2:草稿不能太老(7 天 TTL),避免几周前的编辑复活
        const isNewer = draft.updatedAt > serverAt;
        const isFresh = draftAge < DRAFT_TTL_MS;

        if (isNewer && isFresh) {
          setData(draft.data);
          if (typeof draft.title === "string") setTitle(draft.title);
          if (typeof draft.template === "string") setTemplate(draft.template);
          dirtyRef.current = true;
          setSaveState("dirty");
          console.info(
            `[useLocalDraft] 恢复本地草稿(${Math.round(draftAge / 1000)}s 前编辑,尚未同步到服务端)`,
          );
        } else {
          // 陈旧草稿 — 丢弃,不要让它污染服务端已确认的数据
          console.info(
            `[useLocalDraft] 丢弃陈旧草稿(${isNewer ? "已过期" : "早于服务端"}),采用服务端数据`,
          );
          try { await idbDel(key); } catch { /* ignore */ }
        }
      } catch {
        // IndexedDB 不可用(隐私模式)— 静默退化,只靠服务端
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, initialSavedAt]);

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

    // 先把草稿落到 IndexedDB,再尝试服务端。
    // 顺序很重要:服务端失败时草稿还在,用户下次打开能恢复。
    const meta: DraftMeta = {
      data: dataRef.current,
      title: titleRef.current,
      template: templateRef.current,
      updatedAt: Date.now(),
    };
    try {
      await idbSet(key, meta);
    } catch {
      // IndexedDB 不可用 — 继续尝试服务端
    }

    try {
      await onPersist({
        data: dataRef.current,
        title: titleRef.current,
        template: templateRef.current,
      });
      dirtyRef.current = false;
      setSaveState("saved");
      setLastSavedAt(Date.now());
      // 成功才清草稿 — 失败时保留用于恢复
      try { await idbDel(key); } catch { /* ignore */ }
    } catch (e) {
      setSaveState("error");
      console.error("[useLocalDraft] persist failed — 草稿已保留到 IndexedDB,刷新后可恢复", e);
    } finally {
      savingRef.current = false;
    }
  }, [onPersist, key]);

  // ─── 页面卸载: sendBeacon 做最后一次保存 ─────────────────────────
  // sendBeacon 只能发 POST,所以 /api/resumes/[id] 提供了 POST 别名
  useEffect(() => {
    const handler = () => {
      if (!dirtyRef.current) return;
      // 先落 IndexedDB(同步够快)—— sendBeacon 可能被浏览器拒绝
      try {
        const meta: DraftMeta = {
          data: dataRef.current,
          title: titleRef.current,
          template: templateRef.current,
          updatedAt: Date.now(),
        };
        // 不 await:卸载期间只能同步写,idb-keyval 的 set 本身是同步发起
        void idbSet(key, meta);
      } catch {
        // ignore
      }
      try {
        const blob = new Blob(
          [JSON.stringify({
            data: safeStringify(dataRef.current),
            title: titleRef.current,
            template: templateRef.current,
          })],
          { type: "application/json" },
        );
        // sendBeacon 返回 false 表示浏览器拒绝(通常是 payload 超过 64KB 限制)
        const ok = navigator.sendBeacon?.(`/api/resumes/${resumeId}`, blob);
        if (ok === false) {
          console.warn("[useLocalDraft] sendBeacon 被拒绝(payload 过大?),已依赖 IndexedDB 草稿");
        }
      } catch {
        // ignore — IndexedDB 草稿仍然保留
      }
    };
    window.addEventListener("beforeunload", handler);
    // pagehide 在 bfcache 场景更可靠(移动端 Safari)
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, key]);

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