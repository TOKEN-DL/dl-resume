/**
 * /interview —— 面试押题工作台。
 *
 * 流程:选一份历史简历 → 后台跑押题(带进度) → 看题卡。
 *
 * 这一版**不入库** —— 写入题库是 #21 的活,题卡先给用户看,
 * 勾的「重点关注」先记在本地。
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listResumesByUser } from "@/lib/resume-repo";
import { SiteNav } from "@/components/site-nav/site-nav";
import { InterviewWorkspace } from "@/components/interview/interview-workspace";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function InterviewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/interview");

  const resumes = await listResumesByUser(session.sub);
  const items = resumes.map((r) => ({
    id: r.id,
    title: r.title,
    template: r.template,
    updatedAt: r.updatedAt.toISOString(),
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
          <p className={styles.eyebrow}>INTERVIEW DRILL</p>
          <h1 className={styles.title}>
            按你的简历,<em>押一套</em>面试题。
          </h1>
          <p className={styles.sub}>
            选一份历史简历,智能体会扫描里面的技能与项目,按「入门理解 → 熟练使用 → 原理机制 →
            场景深挖」四档难度出 12 道题,并给出可背诵的参考答案要点。全程在后台跑,
            随时可以离开去干别的,回来进度还在。
          </p>
        </header>

        <InterviewWorkspace resumes={items} />
      </section>
    </main>
  );
}
