/**
 * /optimize —— 简历优化工作台。
 *
 * 流程:选来源 → 后台跑优化(带进度) → 看报告 → 确认后写入简历历史。
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listResumesByUser } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { SiteNav } from "@/components/site-nav/site-nav";
import { OptimizeWorkspace } from "@/components/optimize/optimize-workspace";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function OptimizePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/optimize");

  const resumes = await listResumesByUser(session.sub);
  const items = resumes.map((r) => ({
    id: r.id,
    title: r.title,
    template: r.template,
    updatedAt: r.updatedAt.toISOString(),
    // 选择器里要渲染这份简历的真实缩略图
    data: parseResumeData(r.data),
  }));

  return (
    <main className={styles.shell}>
      <SiteNav
        email={session.email}
        isAdmin={session.isAdmin}
        recent={items.slice(0, 5).map((r) => ({
          id: r.id,
          title: r.title,
          updatedAt: r.updatedAt,
        }))}
      />

      <section className={styles.main}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>AI RESUME COACH</p>
          <h1 className={styles.title}>
            让智能体<em>逐个模块</em>体检你的简历。
          </h1>
          <p className={styles.sub}>
            选一份历史简历,或者直接导入新文件。智能体会在后台逐模块评价、给出优化方案、
            按方案改写,最后把改写结果交给你确认 —— 全程看得见进度,随时可以离开去干别的。
          </p>
        </header>

        <OptimizeWorkspace resumes={items} />
      </section>
    </main>
  );
}
