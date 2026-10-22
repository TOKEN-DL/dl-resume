"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_TAGS, SCENE_TAGS, STYLE_GROUPS, TEMPLATES } from "@/lib/templates";
import type { RoleTag, SceneTag, StyleGroup, TemplateDef } from "@/lib/templates/types";
import { TemplateThumb } from "./template-thumb";
import styles from "./template-picker.module.css";

/**
 * 模板选择器 —— 画廊页与编辑器「换模板」弹层共用。
 *
 * 组件分两层:
 *   - `TemplateGallery`:筛选条 + 缩略图网格(画廊的核心 UI),两种模式共用;
 *   - `TemplatePicker`:在 `TemplateGallery` 外面套一层遮罩 + 居中面板。
 *
 * 画廊页(/templates)直接用 `TemplateGallery` 的 create 模式,
 * 编辑器用 `TemplatePicker` 的 switch 模式。
 */

/** create = 从模板新建简历;switch = 编辑器内换模板 */
export type TemplatePickerMode = "create" | "switch";

export interface TemplateFilterState {
  /** 搜索词(模板名 / 一句话描述,模糊匹配) */
  query: string;
  /** 风格主轴,单选 */
  group: StyleGroup | "all";
  /** 场景标签,多选 */
  scenes: SceneTag[];
  /** 岗位标签,多选 */
  roles: RoleTag[];
}

/**
 * 三维筛选:三个维度之间 AND,同一维度内多选 OR。
 * 搜索按模板名 / 一句话描述模糊匹配,不区分大小写。
 */
export function filterTemplates(
  list: TemplateDef[],
  f: TemplateFilterState,
): TemplateDef[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((def) => {
    if (f.group !== "all" && def.group !== f.group) return false;
    if (f.scenes.length > 0 && !f.scenes.some((s) => def.scenes.includes(s))) return false;
    if (f.roles.length > 0 && !f.roles.some((r) => def.roles.includes(r))) return false;
    if (q) {
      const hit =
        def.name.toLowerCase().includes(q) ||
        def.summary.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

function groupLabel(key: StyleGroup): string {
  return STYLE_GROUPS.find((g) => g.key === key)?.label ?? key;
}
function sceneLabel(key: SceneTag): string {
  return SCENE_TAGS.find((s) => s.key === key)?.label ?? key;
}
function roleLabel(key: RoleTag): string {
  return ROLE_TAGS.find((r) => r.key === key)?.label ?? key;
}

/**
 * 画廊核心 —— 筛选条 + 缩略图网格。
 *
 * 筛选状态是组件内部的,两种模式看到的筛选行为完全一致;
 * 「选中」的动作通过 onSelect 抛给外部(create 模式去建简历,switch 模式去换模板)。
 */
export function TemplateGallery({
  mode,
  onSelect,
  busyId,
  error,
}: {
  mode: TemplatePickerMode;
  /** 选中某套模板 */
  onSelect: (templateId: string) => void;
  /** 正在创建 / 切换的模板 id(用于按钮 loading 态) */
  busyId?: string | null;
  /** 错误文案(不用 alert,直接显示在页面上) */
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<StyleGroup | "all">("all");
  const [scenes, setScenes] = useState<SceneTag[]>([]);
  const [roles, setRoles] = useState<RoleTag[]>([]);

  const filtered = useMemo(
    () => filterTemplates(TEMPLATES, { query, group, scenes, roles }),
    [query, group, scenes, roles],
  );

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  const actionText = mode === "create" ? "使用此模板" : "切换到此模板";

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模板名或风格描述"
            aria-label="搜索模板"
          />
          <span className={styles.count}>
            共 {filtered.length} 套 / {TEMPLATES.length} 套
          </span>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>风格</span>
          <div className={styles.tabs} role="tablist" aria-label="风格主轴">
            <button
              type="button"
              role="tab"
              aria-selected={group === "all"}
              className={`${styles.tab} ${group === "all" ? styles.tabActive : ""}`}
              onClick={() => setGroup("all")}
            >
              全部
            </button>
            {STYLE_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={group === g.key}
                className={`${styles.tab} ${group === g.key ? styles.tabActive : ""}`}
                onClick={() => setGroup(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>场景</span>
          <div className={styles.chips} aria-label="场景标签">
            {SCENE_TAGS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={scenes.includes(s.key)}
                className={`${styles.chip} ${scenes.includes(s.key) ? styles.chipActive : ""}`}
                onClick={() => toggle(scenes, s.key, setScenes)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>岗位</span>
          <div className={styles.chips} aria-label="岗位标签">
            {ROLE_TAGS.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={roles.includes(r.key)}
                className={`${styles.chip} ${roles.includes(r.key) ? styles.chipActive : ""}`}
                onClick={() => toggle(roles, r.key, setRoles)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          没有匹配的模板,换个关键词或少选几个标签试试。
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((def) => {
            const busy = busyId === def.id;
            return (
              <article key={def.id} className={styles.card}>
                <TemplateThumb def={def} />
                <div className={styles.cardBody}>
                  <div className={styles.cardHead}>
                    <div className={styles.cardTitle}>{def.name}</div>
                    <span className={styles.badge}>
                      <span className={styles.dot} />
                      <span>{groupLabel(def.group)}</span>
                    </span>
                  </div>
                  <div className={styles.cardSummary}>{def.summary}</div>
                  <div className={styles.tags}>
                    {def.scenes.map((s) => (
                      <span key={s} className={styles.tag}>
                        {sceneLabel(s)}
                      </span>
                    ))}
                    {def.roles.map((r) => (
                      <span key={r} className={styles.tag}>
                        {roleLabel(r)}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.cardBtn}
                    disabled={busy}
                    onClick={() => onSelect(def.id)}
                  >
                    {busy ? "处理中…" : actionText}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 模板选择弹层 —— 编辑器「换模板」用(宽幅居中面板 + 半透明遮罩)。
 *
 * 外部用条件渲染控制显隐(`{open && <TemplatePicker ... />}`),
 * 点遮罩或按 Esc 关闭。
 */
export function TemplatePicker({
  mode,
  onSelect,
  onClose,
}: {
  mode: TemplatePickerMode;
  /** 选中某套模板 */
  onSelect: (templateId: string) => void;
  /** 关闭弹层 */
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSelect(templateId: string) {
    onSelect(templateId);
    // 换模板:选中即生效并收起弹层;新建模式由外部跳转,不用在这里关
    if (mode === "switch") onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "选择模板" : "切换模板"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>
            {mode === "create" ? "挑一套模板,新建简历" : "切换模板"}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className={styles.panelBody}>
          <TemplateGallery mode={mode} onSelect={handleSelect} />
        </div>
      </div>
    </div>
  );
}
