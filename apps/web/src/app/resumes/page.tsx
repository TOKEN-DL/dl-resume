/**
 * /resumes — 我的简历列表(F2)
 * Server: 取 session + 简历列表 → 传给 client
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listResumesByUser } from "@/lib/resume-repo";
import ResumesClient from "./ResumesClient";

export const dynamic = "force-dynamic"; // 每次都拉最新列表

export default async function ResumesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/resumes");
  }

  const resumes = await listResumesByUser(session.sub);
  // 序列化 Date → ISO string(传给 client component)
  const serialized = resumes.map((r) => ({
    id: r.id,
    title: r.title,
    template: r.template,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <ResumesClient
      email={session.email}
      isAdmin={session.isAdmin}
      initialResumes={serialized}
    />
  );
}