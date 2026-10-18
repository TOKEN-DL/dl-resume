/**
 * /resumes — 我的简历列表(issue #2 的占位,F1 仅保证已登录可访问)
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function ResumesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/resumes");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-blue-700">
        Dashboard
      </p>
      <h1 className="mb-6 font-display text-5xl tracking-tight text-ink">
        欢迎,<em className="font-light italic text-blue-700">{session.email}</em>
      </h1>
      <p className="mb-8 max-w-xl text-base text-ink-soft">
        简历列表的 CRUD 实现在 <Link href="https://example.com" className="text-blue-700 underline">issue #2</Link> 中。
        目前 F1 已完成邮箱密码注册/登录与会话。
      </p>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-full border border-paper-edge px-5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          退出登录
        </button>
      </form>
    </main>
  );
}