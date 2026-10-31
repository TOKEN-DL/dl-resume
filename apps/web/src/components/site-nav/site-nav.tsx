"use client";

/**
 * SiteNav —— 全站顶栏。
 *
 * 四个模块:首页 / 模板广场 / 智能优化 / 我的简历。
 * 「我的简历」带一个下拉,下拉的第一项就是整块实心的「创建简历」主按钮,
 * 下面跟着最近编辑过的简历,再往下是模板广场 / 设置 / 退出登录。
 *
 * 「智能优化」是简历体检工作台,顶部带 ✦ 标记 —— 首页 CTA 和「我的简历」
 * 里的入口用的是同一个符号,一眼能认出是同一个功能。
 *
 * 账号信息由 server 组件通过 props 传进来(email 为空 = 未登录),
 * 组件本身不碰 session —— 这样 /、/templates、/resumes、/optimize 四个入口
 * 都能复用同一份导航,各自决定要不要读 session。
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createResume } from "./create-resume";
import { OptimizeBadge } from "@/components/optimize/optimize-badge";
import styles from "./site-nav.module.css";

/** 下拉里的「最近编辑」条目 */
export interface NavResume {
  id: string;
  title: string;
  updatedAt?: string;
}

export interface SiteNavProps {
  /** 登录邮箱;null / undefined 表示未登录 */
  email?: string | null;
  isAdmin?: boolean;
  /** 最近编辑的简历 */
  recent?: NavResume[];
}

/**
 * 顶部主导航 —— 「我的简历」自带下拉,不在这张表里。
 *
 * mark 是给「智能优化」用的 ✦ 标记,跟首页 CTA、简历列表里的入口一致。
 * 所有项都带 mark 字段(不用时给空串),渲染时就不用判空分支。
 */
const PRIMARY_LINKS = [
  { href: "/", label: "首页", mark: "" },
  { href: "/templates", label: "模板广场", mark: "" },
  { href: "/optimize", label: "智能优化", mark: "✦" },
] as const;

/** 默认值用常量,避免每次渲染都造一个新数组导致 useMemo 失效 */
const NO_RESUMES: NavResume[] = [];

export function SiteNav({ email, isAdmin = false, recent = NO_RESUMES }: SiteNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  // 菜单有两个来源:鼠标悬停(hovered)与显式点击钉住(pinned)。
  // 分开存是因为「hover 已经把菜单打开了,再点一下 caret」不该把它关掉 ——
  // 那是触屏用户唯一的关闭方式,桌面端混在一起会让菜单开了又关。
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  const open = hovered || pinned;
  const signedIn = Boolean(email);

  const recentItems = useMemo(
    () =>
      [...recent]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 3),
    [recent],
  );

  function closeMenu() {
    setHovered(false);
    setPinned(false);
  }

  // 点外面 / 按 Esc 收起下拉
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!groupRef.current?.contains(e.target as Node)) closeMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onCreate() {
    if (!signedIn) {
      router.push("/login?next=/resumes");
      return;
    }
    setCreating(true);
    setError(null);
    const res = await createResume();
    setCreating(false);
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

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const initial = (email ?? "·").slice(0, 1).toUpperCase();

  return (
    <header className={styles.bar} data-nav="bar">
      <Link href="/" className={styles.brand} aria-label="简册 · 首页">
        <span className={styles.glyph} aria-hidden="true">
          简
        </span>
        <span className={styles.word}>简册</span>
      </Link>

      <nav className={styles.links} aria-label="主导航">
        {PRIMARY_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.link} ${isActive(item.href) ? styles.linkActive : ""}`}
            aria-current={isActive(item.href) ? "page" : undefined}
          >
            {item.mark && (
              <span className={styles.linkMark} aria-hidden="true">
                {item.mark}
              </span>
            )}
            {item.label}
          </Link>
        ))}

        <div
          className={styles.group}
          ref={groupRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span className={styles.trigger}>
            <Link
              href="/resumes"
              className={`${styles.link} ${isActive("/resumes") ? styles.linkActive : ""}`}
              aria-current={isActive("/resumes") ? "page" : undefined}
            >
              我的简历
            </Link>
            <button
              type="button"
              className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
              aria-label="展开我的简历菜单"
              aria-expanded={open}
              aria-haspopup="true"
              onClick={(e) => {
                e.preventDefault();
                setPinned((v) => !v);
              }}
            >
              ▾
            </button>
          </span>

          {open && (
            <div className={styles.menu} role="menu" aria-label="我的简历菜单">
              <button
                type="button"
                role="menuitem"
                className={styles.createBtn}
                onClick={() => {
                  closeMenu();
                  void onCreate();
                }}
                disabled={creating}
              >
                <span className={styles.createPlus} aria-hidden="true">
                  ＋
                </span>
                <span>{creating ? "创建中…" : "创建简历"}</span>
              </button>

              {error && <p className={styles.menuError}>{error}</p>}

              {recentItems.length > 0 && (
                <>
                  <p className={styles.menuLabel}>最近编辑</p>
                  {recentItems.map((r) => (
                    <Link
                      key={r.id}
                      href={`/resumes/${r.id}/edit`}
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <span className={styles.menuItemText}>{r.title}</span>
                      <span className={styles.menuItemMeta}>{formatWhen(r.updatedAt)}</span>
                    </Link>
                  ))}
                </>
              )}

              <div className={styles.divider} />

              <Link
                href="/templates"
                className={styles.menuItem}
                role="menuitem"
                onClick={closeMenu}
              >
                <span className={styles.menuItemText}>模板广场</span>
              </Link>
              <Link
                href="/settings"
                className={styles.menuItem}
                role="menuitem"
                onClick={closeMenu}
              >
                <span className={styles.menuItemText}>设置</span>
              </Link>
              {signedIn ? (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    closeMenu();
                    void onLogout();
                  }}
                >
                  <span className={styles.menuItemText}>退出登录</span>
                </button>
              ) : (
                <Link href="/login" className={styles.menuItem} role="menuitem" onClick={closeMenu}>
                  <span className={styles.menuItemText}>登录</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className={styles.right}>
        <OptimizeBadge />
        {isAdmin && <span className={styles.adminTag}>ADMIN</span>}
        {signedIn ? (
          <span className={styles.pill}>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.emailText}>{email}</span>
          </span>
        ) : (
          <Link href="/login" className={styles.loginLink}>
            登录
          </Link>
        )}
      </div>
    </header>
  );
}

/** 相对时间 —— 和 /resumes 列表页保持同一套说法 */
function formatWhen(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default SiteNav;
