"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

interface Props {
  email: string;
  isAdmin: boolean;
}

export default function SettingsClient({ email, isAdmin }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (confirmText !== "DELETE") {
      setError("请输入 DELETE 以确认");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm: "DELETE" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) setError("密码错误");
        else setError(err.error || `HTTP ${res.status}`);
        return;
      }
      router.push("/login?deleted=1");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button onClick={() => router.push("/resumes")} className={styles.back}>
          ← 返回
        </button>
        <div className={styles.brand}>账户设置</div>
        <div style={{ width: 60 }} />
      </header>

      <section className={styles.main}>
        <div className={styles.card}>
          <h2>账户信息</h2>
          <div className={styles.row}>
            <span className={styles.label}>邮箱</span>
            <span>{email}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>角色</span>
            <span>{isAdmin ? "管理员" : "普通用户"}</span>
          </div>
        </div>

        <div className={`${styles.card} ${styles.dangerCard}`}>
          <h2>注销账户</h2>
          <p className={styles.dangerHint}>
            注销后,你的账号、所有简历(包括服务端加密数据)、关联的加密密钥将<strong>永久删除</strong>。
            此操作不可撤销。
          </p>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className={styles.dangerBtn}
            >
              我要注销账户
            </button>
          ) : (
            <form onSubmit={handleDelete} className={styles.confirmForm}>
              <div className={styles.field}>
                <label>输入 <code>DELETE</code> 确认</label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label>输入当前密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="当前登录密码"
                  autoComplete="current-password"
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setPassword("");
                    setConfirmText("");
                    setError(null);
                  }}
                  className={styles.cancelBtn}
                  disabled={busy}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={styles.dangerBtn}
                  disabled={busy}
                >
                  {busy ? "处理中…" : "永久注销账户"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}