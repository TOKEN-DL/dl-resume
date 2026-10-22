"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { parseResumeData, type ResumeData } from "@/lib/validation/resume";
import { SiteNav } from "@/components/site-nav/site-nav";
import { TemplateThumb } from "@/components/templates/template-thumb";
import styles from "./page.module.css";

// 导入面板连带 markdown / pdf / docx 解析器有好几 MB,
// 必须等用户真的点了"导入简历"再去下载,否则列表页首屏会被拖垮。
const ImportResumeModal = dynamic(
  () => import("@/components/import/import-resume").then((m) => m.ImportResumeModal),
  { ssr: false, loading: () => <div className={styles.modal} /> },
);

interface Resume {
  id: string;
  title: string;
  template: string;
  updatedAt: string;
  createdAt: string;
  /** 简历正文 —— 卡片缩略图渲染的就是它 */
  data?: ResumeData;
}

/** 模板名从注册表派生;未知 id 兜底显示原始 id,便于排查脏数据 */
function templateLabel(id: string): string {
  const t = getTemplate(id);
  return t.id === id ? t.name : id;
}

function formatTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default function ResumesClient({
  email,
  initialResumes,
  isAdmin,
}: {
  email: string;
  initialResumes: Resume[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>(initialResumes);
  const [renaming, setRenaming] = useState<Resume | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Resume | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    const r = await fetch("/api/resumes", { cache: "no-store" });
    if (r.ok) {
      const { resumes: list } = await r.json();
      // 接口里的 data 是 JSON 字符串,这里解析成对象供缩略图渲染
      setResumes(
        (list as Array<Resume & { data?: string }>).map((x) => ({
          ...x,
          data: parseResumeData(x.data),
        })),
      );
    }
  }

  async function createResume() {
    setBusy(true);
    try {
      const r = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "未命名简历", template: "classic" }),
      });
      if (r.ok) {
        await refresh();
        const { resume } = await r.json();
        router.push(`/resumes/${resume.id}/edit`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    const r = await fetch(`/api/resumes/${id}/duplicate`, { method: "POST" });
    if (r.ok) await refresh();
  }

  function openRename(r: Resume) {
    setRenaming(r);
    setNewName(r.title);
  }

  async function commitRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming || !newName.trim()) return;
    const r = await fetch(`/api/resumes/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newName.trim() }),
    });
    if (r.ok) {
      setRenaming(null);
      await refresh();
    }
  }

  async function commitDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/resumes/${deleting.id}`, { method: "DELETE" });
      if (r.ok) {
        setDeleting(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  // ─── JSON Resume 导入/导出 ───────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  async function importJsonResume(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const title = file.name.replace(/\.json$/i, "");
      const res = await fetch(`/api/resumes/import-json?title=${encodeURIComponent(title)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`导入失败: ${err.message || res.status}`);
        return;
      }
      const { resume } = await res.json();
      await refresh();
      router.push(`/resumes/${resume.id}/edit`);
    } finally {
      setImporting(false);
    }
  }

  // ─── 多格式导入(PDF / Word / Markdown) ──────────────────────────
  async function onImported(resumeId: string, missingFields: string[]) {
    setImportOpen(false);
    await refresh();
    // 缺失字段通过 query 带到编辑器,由编辑页顶部提示补齐
    const qs = missingFields.length
      ? `?imported=1&missing=${encodeURIComponent(missingFields.join(","))}`
      : "?imported=1";
    router.push(`/resumes/${resumeId}/edit${qs}`);
  }

  function exportOne(id: string, title: string) {
    window.location.href = `/api/resumes/${id}/export-json`;
  }

  function exportAll() {
    if (resumes.length === 0) return;
    resumes.forEach((r, i) => {
      setTimeout(() => exportOne(r.id, r.title), i * 300);
    });
  }

  return (
    <main className={styles.shell}>
      <SiteNav email={email} isAdmin={isAdmin} recent={resumes} />

      <section className={styles.main}>
        <div className={styles.head}>
          <div className={styles.eyebrow}>DASHBOARD</div>
          <h1 className={styles.title}>
            我的简历,<br />
            不止<em>一份</em>。
          </h1>
          <p className={styles.sub}>
            针对不同岗位 fork 出多个版本。模板沿用,只改内容。
          </p>
          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles["btn-primary"]}`}
              onClick={createResume}
              disabled={busy}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
              <span>新建简历</span>
            </button>
            <button
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={() => router.push("/templates")}
            >
              <span>▦ 从模板新建</span>
            </button>
            <button
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={() => router.push("/optimize")}
            >
              <span>✦ 智能体优化</span>
            </button>
            <button
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={() => setImportOpen(true)}
            >
              <span>↓ 导入简历</span>
            </button>
            <button
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <span>↓ {importing ? "导入中…" : "导入 JSON Resume"}</span>
            </button>
            <button
              className={`${styles.btn} ${styles["btn-ghost"]}`}
              onClick={exportAll}
              disabled={resumes.length === 0}
            >
              <span>↑ 导出全部</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJsonResume(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {resumes.length === 0 ? (
          <div className={styles.empty}>
            还没有简历。点击上方「新建简历」开始你的第一份。
          </div>
        ) : (
          <div className={styles.grid}>
            {resumes.map((r, i) => (
              <article
                key={r.id}
                className={styles.card}
                onClick={() => router.push(`/resumes/${r.id}/edit`)}
              >
                <div className={styles["actions-row"]}>
                  <button
                    className={styles["icon-btn"]}
                    title="重命名"
                    onClick={(e) => { e.stopPropagation(); openRename(r); }}
                  >✎</button>
                  <button
                    className={styles["icon-btn"]}
                    title="复制"
                    onClick={(e) => { e.stopPropagation(); duplicate(r.id); }}
                  >⎘</button>
                  <button
                    className={styles["icon-btn"]}
                    title="导出 JSON"
                    onClick={(e) => { e.stopPropagation(); exportOne(r.id, r.title); }}
                  >↓</button>
                  <button
                    className={`${styles["icon-btn"]} ${styles.danger}`}
                    title="删除"
                    onClick={(e) => { e.stopPropagation(); setDeleting(r); }}
                  >×</button>
                </div>
                {/* 缩略图 = 这份简历用它的模板渲染出来的真实 A4 */}
                <div className={styles.thumb}>
                  <TemplateThumb
                    def={getTemplate(r.template)}
                    data={r.data}
                    lazy={i >= 4}
                  />
                </div>
                <div className={styles["card-meta"]}>
                  <div>
                    <div className={styles["card-title"]}>{r.title}</div>
                    <div className={styles["card-sub"]}>
                      {formatTime(r.updatedAt)} · 自动保存
                    </div>
                  </div>
                  <span className={styles.badge}>
                    <span className={styles.dot}></span>
                    <span>{templateLabel(r.template)}</span>
                  </span>
                </div>
              </article>
            ))}
            <button
              className={`${styles.card} ${styles["card-new"]}`}
              onClick={createResume}
              disabled={busy}
            >
              <div className={styles["new-icon"]}>＋</div>
              <div className={styles["new-label"]}>新建空白简历</div>
            </button>
          </div>
        )}
      </section>

      {importOpen && (
        <ImportResumeModal
          onClose={() => setImportOpen(false)}
          onCreated={onImported}
        />
      )}

      {renaming && (
        <div className={styles.modal} onClick={() => setRenaming(null)}>
          <form
            className={styles["modal-card"]}
            onClick={(e) => e.stopPropagation()}
            onSubmit={commitRename}
          >
            <h3>重命名简历</h3>
            <p>给这份简历起一个新名字。</p>
            <div className="field">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={120}
                required
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid var(--paper-edge)",
                  borderRadius: 6,
                  fontSize: 15,
                  background: "#fff",
                  color: "var(--ink)",
                }}
              />
            </div>
            <div className={styles["modal-actions"]}>
              <button
                type="button"
                className={`${styles.btn} ${styles["btn-ghost"]}`}
                onClick={() => setRenaming(null)}
              >
                取消
              </button>
              <button type="submit" className={`${styles.btn} ${styles["btn-primary"]}`}>
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className={styles.modal} onClick={() => setDeleting(null)}>
          <div
            className={styles["modal-card"]}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>删除简历?</h3>
            <p>
              将永久删除「{deleting.title}」。此操作不可撤销,服务端加密数据将一并清除。
            </p>
            <div className={styles["modal-actions"]}>
              <button
                type="button"
                className={`${styles.btn} ${styles["btn-ghost"]}`}
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles["btn-primary"]}`}
                onClick={commitDelete}
                disabled={busy}
              >
                {busy ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}