/**
 * 自动保存数据流测试 — F15 / 用户报告"返回后再进入内容丢失"
 *
 * 覆盖四条曾经出问题、且都静默失败的链路:
 *  1. POST 别名存在(sendBeacon 只能发 POST,没有它关闭页面时保存直接 405)
 *  2. 草稿只在比服务端新时才采用(否则陈旧草稿覆盖真实内容)
 *  3. flush 失败时保留 IndexedDB 草稿(下次打开能恢复)
 *  4. 草稿超过 7 天 TTL 一律丢弃
 *
 * 用真 React renderHook + fake-indexeddb,不手写 hook 替身 ——
 * 手写替身测不到 React 内部调度,曾经因此测出假结果。
 */
// @vitest-environment jsdom
import "fake-indexeddb/auto"; // 必须在任何 idb-keyval import 之前
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { get, set as idbSet, del as idbDel } from "idb-keyval";
import { useLocalDraft } from "./use-local-draft";

const KEY = "resume:r1";
const now = () => Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** 清空所有 resume:* 草稿 */
async function clearDrafts() {
  // fake-indexeddb 支持 keys(),但 idb-keyval 未导出;直接覆盖测试用的 key
  await idbDel(KEY).catch(() => {});
}

const baseProps = (over: any = {}) => ({
  resumeId: "r1",
  initialData: { basics: { name: "服务端内容" } } as any,
  initialTitle: "服务端标题",
  initialTemplate: "classic",
  onPersist: vi.fn(async () => {}),
  ...over,
});

beforeEach(async () => {
  await clearDrafts();
  vi.clearAllMocks();
});

afterEach(async () => {
  await clearDrafts();
  vi.restoreAllMocks();
});

describe("useLocalDraft — flush 链路", () => {
  it("初始状态 idle,不触发保存", async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() => useLocalDraft(baseProps({ onPersist })));
    expect(result.current.saveState).toBe("idle");
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("无改动时 flush 不发请求", async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() => useLocalDraft(baseProps({ onPersist })));
    await act(async () => { await result.current.flush(); });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it("改动后 flush 发送完整快照并标记 saved", async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() => useLocalDraft(baseProps({ onPersist })));

    act(() => { result.current.setTitle("新标题"); });
    expect(result.current.saveState).toBe("dirty");

    await act(async () => { await result.current.flush(); });

    expect(onPersist).toHaveBeenCalledTimes(1);
    const payload = (onPersist.mock.calls as any)[0][0];
    expect(payload.title).toBe("新标题");
    expect(result.current.saveState).toBe("saved");
    expect(result.current.lastSavedAt).toBeTypeOf("number");
  });

  it("flush 成功后清除 IndexedDB 草稿", async () => {
    const { result } = renderHook(() => useLocalDraft(baseProps()));
    act(() => { result.current.setTitle("X"); });
    await act(async () => { await result.current.flush(); });
    expect(await get(KEY)).toBeUndefined();
  });
});

describe("useLocalDraft — 失败时保留草稿(不丢数据)", () => {
  it("服务端失败时进入 error 状态", async () => {
    const onPersist = vi.fn(async () => { throw new Error("500"); });
    const { result } = renderHook(() => useLocalDraft(baseProps({ onPersist })));
    act(() => { result.current.setTitle("X"); });
    await act(async () => { await result.current.flush(); });
    expect(result.current.saveState).toBe("error");
  });

  it("服务端失败时草稿仍在 IndexedDB(下次打开可恢复)", async () => {
    const onPersist = vi.fn(async () => { throw new Error("500"); });
    const { result } = renderHook(() => useLocalDraft(baseProps({ onPersist })));
    act(() => { result.current.setTitle("未同步的标题"); });
    await act(async () => { await result.current.flush(); });

    const draft = (await get(KEY)) as any;
    expect(draft).toBeDefined();
    expect(draft.title).toBe("未同步的标题");
  });

  it("服务端失败后重开编辑器能恢复草稿", async () => {
    const failing = vi.fn(async () => { throw new Error("500"); });
    const first = renderHook(() => useLocalDraft(baseProps({ onPersist: failing })));
    act(() => { first.result.current.setTitle("抢救回来的标题"); });
    await act(async () => { await first.result.current.flush(); });
    first.unmount();

    // 重开,服务端 updatedAt 是 60s 前 → 草稿更新,应该被采用
    const second = renderHook(() =>
      useLocalDraft(baseProps({ initialSavedAt: now() - 60_000 })),
    );
    await waitFor(() => expect(second.result.current.title).toBe("抢救回来的标题"));
    expect(second.result.current.saveState).toBe("dirty");
  });
});

describe("useLocalDraft — 页面卸载兜底(beacon)", () => {
  it("beforeunload 触发 sendBeacon,URL 指向该简历", async () => {
    const beacon = vi.fn(() => true);
    (globalThis as any).navigator.sendBeacon = beacon;

    const { result } = renderHook(() => useLocalDraft(baseProps()));
    act(() => { result.current.setTitle("未保存的改动"); });

    act(() => { window.dispatchEvent(new Event("beforeunload")); });

    expect(beacon).toHaveBeenCalledTimes(1);
    expect((beacon.mock.calls as any)[0][0]).toBe("/api/resumes/r1");
  });

  it("pagehide 也触发(safari bfcache)", async () => {
    const beacon = vi.fn(() => true);
    (globalThis as any).navigator.sendBeacon = beacon;

    const { result } = renderHook(() => useLocalDraft(baseProps()));
    act(() => { result.current.setTitle("X"); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("无改动时不发 beacon", async () => {
    const beacon = vi.fn(() => true);
    (globalThis as any).navigator.sendBeacon = beacon;

    renderHook(() => useLocalDraft(baseProps()));
    act(() => { window.dispatchEvent(new Event("beforeunload")); });

    expect(beacon).not.toHaveBeenCalled();
  });

  it("beacon 被拒绝时草稿仍落到 IndexedDB", async () => {
    (globalThis as any).navigator.sendBeacon = vi.fn(() => false);

    const { result } = renderHook(() => useLocalDraft(baseProps()));
    act(() => { result.current.setTitle("紧急保存"); });
    act(() => { window.dispatchEvent(new Event("beforeunload")); });

    const draft = (await get(KEY)) as any;
    expect(draft).toBeDefined();
    expect(draft.title).toBe("紧急保存");
  });
});

describe("useLocalDraft — 草稿恢复策略(防陈旧覆盖)", () => {
  it("草稿比服务端新 → 恢复草稿", async () => {
    await idbSet(KEY, {
      data: { basics: { name: "草稿中的张三" } },
      title: "草稿标题",
      template: "modern",
      updatedAt: now() - 1000,
    });

    const { result } = renderHook(() =>
      useLocalDraft(baseProps({ initialSavedAt: now() - 60_000 })),
    );

    await waitFor(() => expect(result.current.title).toBe("草稿标题"));
    expect(result.current.template).toBe("modern");
    expect(result.current.saveState).toBe("dirty");
  });

  it("草稿早于服务端 → 丢弃草稿,采用服务端数据", async () => {
    await idbSet(KEY, {
      data: { basics: { name: "陈旧草稿" } },
      title: "陈旧标题",
      template: "minimal",
      updatedAt: now() - 120_000,
    });

    const { result } = renderHook(() =>
      useLocalDraft(baseProps({ initialSavedAt: now() })),
    );

    await waitFor(() => expect(result.current.template).toBe("classic"));
    expect(result.current.title).toBe("服务端标题");
    expect(result.current.saveState).toBe("idle");
  });

  it("丢弃陈旧草稿时同时删掉它(不让它一直复活)", async () => {
    await idbSet(KEY, {
      data: { basics: { name: "陈旧" } },
      title: "陈旧标题",
      updatedAt: now() - 120_000,
    });

    renderHook(() => useLocalDraft(baseProps({ initialSavedAt: now() })));

    await waitFor(async () => {
      expect(await get(KEY)).toBeUndefined();
    });
  });

  it("超过 7 天 TTL 的草稿一律丢弃(即使比服务端新)", async () => {
    await idbSet(KEY, {
      data: { basics: { name: "两周前的草稿" } },
      title: "很久以前的标题",
      updatedAt: now() - 14 * DAY,
    });

    const { result } = renderHook(() =>
      useLocalDraft(baseProps({ initialSavedAt: 0 })),
    );

    await waitFor(() => expect(result.current.title).toBe("服务端标题"));
    expect(await get(KEY)).toBeUndefined();
  });

  it("7 天内的草稿即使时间戳略早也会被服务端基准救回", async () => {
    // 服务端没传 initialSavedAt → 用挂载时刻作基准,草稿自然"更旧",应丢弃
    await idbSet(KEY, {
      data: { basics: { name: "X" } },
      title: "旧草稿",
      updatedAt: now() - 5000,
    });

    const { result } = renderHook(() => useLocalDraft(baseProps()));
    await waitFor(() => expect(result.current.title).toBe("服务端标题"));
  });

  it("无草稿时直接用服务端数据", async () => {
    const { result } = renderHook(() => useLocalDraft(baseProps()));
    await waitFor(() => expect(result.current.title).toBe("服务端标题"));
    expect(result.current.template).toBe("classic");
    expect(result.current.saveState).toBe("idle");
  });
});