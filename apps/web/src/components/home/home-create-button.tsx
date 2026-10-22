"use client";

/**
 * 首页的「创建简历」CTA。
 *
 * 未登录时把人送去 /login?next=/resumes,登录后建好简历直接进编辑器。
 * 按钮长什么样由调用方的 CSS Module 决定(className 透传),
 * 这里只管行为。
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createResume } from "@/components/site-nav/create-resume";
import styles from "./home-create-button.module.css";

export function HomeCreateButton({
  signedIn,
  className,
  label = "创建简历",
}: {
  signedIn: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!signedIn) {
      router.push("/login?next=/resumes");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createResume();
    setBusy(false);
    if (res.ok) {
      router.push(`/resumes/${res.id}/edit`);
      return;
    }
    if (res.reason === "unauthorized") {
      router.push("/login?next=/resumes");
      return;
    }
    setError(res.message);
  }

  return (
    <span className={styles.wrap}>
      <button type="button" className={className} onClick={onClick} disabled={busy}>
        <span className={styles.plus} aria-hidden="true">
          ＋
        </span>
        <span>{busy ? "创建中…" : label}</span>
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </span>
  );
}

export default HomeCreateButton;
