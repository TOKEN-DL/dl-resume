/**
 * /templates —— 模板库画廊页。
 *
 * Server: 只负责页面外壳(标题 + 返回按钮),画廊本体是 Client Component。
 */
import Link from "next/link";
import { GalleryClient } from "./gallery-client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // 模板库每次都取最新注册表

export default function TemplatesPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandGlyph}>简</div>
          <span>简册</span>
        </div>
        <Link className={styles.back} href="/resumes">
          ← 返回简历列表
        </Link>
      </header>

      <section className={styles.main}>
        <div className={styles.head}>
          <div className={styles.eyebrow}>TEMPLATE LIBRARY</div>
          <h1 className={styles.title}>
            挑一套<em>模板</em>,
            <br />
            开始你的简历。
          </h1>
          <p className={styles.sub}>
            32 套版式,每套都用真实范文渲染。按风格、场景、岗位挑,
            点「使用此模板」直接生成一份可编辑的简历。
          </p>
        </div>

        <GalleryClient />
      </section>
    </main>
  );
}
