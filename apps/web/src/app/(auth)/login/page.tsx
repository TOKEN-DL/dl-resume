"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/resumes";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      if (r.status === 401) {
        setError("邮箱或密码错误");
      } else if (r.status === 400) {
        setError("请检查输入格式");
      } else {
        setError("登录失败,请稍后重试");
      }
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles["form-card"]}>
      <h2>欢迎回来</h2>
      <p className={styles["form-sub"]}>登录以继续编辑你的简历。</p>
      <form onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn-primary"]}`}
          disabled={busy}
        >
          {busy ? "登录中…" : "进入工作台"}
        </button>
      </form>
      <div className={styles.foot}>
        没有账号?<Link href="/register">立即注册</Link>
      </div>
    </div>
  );
}