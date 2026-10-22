/**
 * /templates —— 模板库画廊页。
 *
 * Server: 只负责页面外壳(顶栏 + 标题),画廊本体是 Client Component。
 * 顶栏用全站共享的 SiteNav,账号信息从 session 取。
 */
import { GalleryClient } from "./gallery-client";
import { TEMPLATES } from "@/lib/templates";
import { getSession } from "@/lib/session";
import { listResumeSummaries } from "@/lib/resume-repo";
import { SiteNav } from "@/components/site-nav/site-nav";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // 模板库每次都取最新注册表 + session

export default async function TemplatesPage() {
  const session = await getSession();
  const recent = session
    ? (await listResumeSummaries(session.sub)).slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt.toISOString(),
      }))
    : [];

  return (
    <main className={styles.shell}>
      <SiteNav
        email={session?.email ?? null}
        isAdmin={session?.isAdmin}
        recent={recent}
      />

      <section className={styles.main}>
        <div className={styles.head}>
          <div className={styles.eyebrow}>TEMPLATE LIBRARY</div>
          <h1 className={styles.title}>
            挑一套<em>模板</em>,
            <br />
            开始你的简历。
          </h1>
          <p className={styles.sub}>
            {TEMPLATES.length} 套版式,每套都用真实范文渲染。按风格、场景、岗位挑,
            点「使用此模板」直接生成一份可编辑的简历。
          </p>
        </div>

        <GalleryClient />
      </section>
    </main>
  );
}
