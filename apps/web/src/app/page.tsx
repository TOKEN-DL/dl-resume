import Link from "next/link";

/**
 * Root page — placeholder that proves the scaffold runs.
 * Real implementation lands on /resumes after login (see issue #1 + #2).
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="mb-6 font-mono text-xs uppercase tracking-[0.18em] text-blue-700">
        Resume · v0.1 MVP
      </p>
      <h1 className="mb-6 font-display text-5xl leading-[1.05] tracking-tight text-ink md:text-6xl">
        简历,<em className="font-light italic text-blue-700">真正</em>属于你。
      </h1>
      <p className="mb-10 max-w-xl font-serif text-base leading-relaxed text-ink-soft">
        一个面向中文求职者的开源简历系统。结构化分块编辑、实时预览、客户端
        PDF 导出。简历内容在服务端以 AES-256-GCM 加密——服务商看不到明文,
        数据主权完全在你手中。
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/resumes"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-blue-800"
        >
          进入工作台 →
        </Link>
        <a
          href="https://jsonresume.org/schema"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-paper-edge px-5 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          了解 JSON Resume
        </a>
      </div>
      <div className="mt-16 grid grid-cols-2 gap-6 border-t border-paper-edge pt-8 font-mono text-xs text-pencil md:grid-cols-4">
        <div>
          <b className="text-ink">03</b> 模板
        </div>
        <div>
          <b className="text-ink">10</b> 模块
        </div>
        <div>
          <b className="text-ink">≤300ms</b> 同步
        </div>
        <div>
          <b className="text-ink">0</b> 明文
        </div>
      </div>
    </main>
  );
}