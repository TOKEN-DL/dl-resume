"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../auth.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (r.ok) {
        // Auto-login after register
        const login = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (login.ok) {
          router.push("/resumes");
          router.refresh();
          return;
        }
        router.push("/login");
        return;
      }
      if (r.status === 409) {
        setError("该邮箱已注册,直接登录");
      } else if (r.status === 400) {
        const data = await r.json().catch(() => null);
        setError(data?.details?.fieldErrors?.email?.[0]
          ?? data?.details?.fieldErrors?.password?.[0]
          ?? data?.details?.fieldErrors?.name?.[0]
          ?? "请检查输入格式");
      } else {
        setError("注册失败,请稍后重试");
      }
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles["form-card"]}>
      <h2>创建账号</h2>
      <p className={styles["form-sub"]}>注册即可开始制作你的第一份简历。</p>
      <form onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor="name">姓名</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            maxLength={60}
          />
        </div>
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
          <label htmlFor="password">密码(至少 8 位)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button
          type="submit"
          className={`${styles.btn} ${styles["btn-primary"]}`}
          disabled={busy}
        >
          {busy ? "注册中…" : "创建账号"}
        </button>
      </form>
      <div className={styles.foot}>
        已有账号?<Link href="/login">直接登录</Link>
      </div>
    </div>
  );
}