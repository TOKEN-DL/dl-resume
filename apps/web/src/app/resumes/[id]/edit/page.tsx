/**
 * /resumes/[id]/edit — 简历编辑器入口 (server component).
 * F3: 拉取简历,验证所有权,交给 EditorShell 渲染.
 */
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { assertOwnership } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { EditorShell } from "@/components/editor/editor-shell";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  // 必须走 assertOwnership — 它内部会解密(F18),不要绕过 repo 直接查 prisma
  let resume;
  try {
    resume = await assertOwnership(id, session.sub);
  } catch {
    notFound(); // 不暴露存在性(找不到 / 非本人 一律 404)
  }

  const data = parseResumeData(resume.data);

  return (
    <EditorShell
      resumeId={resume.id}
      initialTitle={resume.title}
      initialTemplate={resume.template}
      initialData={data}
    />
  );
}