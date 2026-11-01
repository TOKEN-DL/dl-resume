/**
 * /questions —— 我的题库(浏览 / 收藏 / 删除 / 按套分组)。
 *
 * issue #19;设计文档 §8.2。
 *
 * Server 只做三件事:验登录、摆导航、把题库组件挂上去。
 * 题库数据由客户端组件从 /api/questions 拉 —— 收藏 / 删除都回写同一个接口,
 * 这样「看到的」和「改到的」永远是一条路。
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listResumeSummaries } from "@/lib/resume-repo";
import { SiteNav } from "@/components/site-nav/site-nav";
import { QuestionBank } from "@/components/questions/question-bank";
import styles from "./page.module.css";

export const dynamic = "force-dynamic"; // 题库随时在变,别拿缓存

export default async function QuestionsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/questions");

  // 导航栏的「最近编辑」只要列表元信息,不解密简历正文
  const resumes = await listResumeSummaries(session.sub);

  return (
    <main className={styles.shell}>
      <SiteNav
        email={session.email}
        isAdmin={session.isAdmin}
        recent={resumes.slice(0, 5).map((r) => ({
          id: r.id,
          title: r.title,
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />

      <section className={styles.main}>
        <QuestionBank />
      </section>
    </main>
  );
}
