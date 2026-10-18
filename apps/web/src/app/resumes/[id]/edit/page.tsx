/**
 * /resumes/[id]/edit — 简历编辑器入口 (server component).
 * F3: 拉取简历,验证所有权,交给 EditorShell 渲染.
 */
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
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
  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume) notFound();
  if (resume.userId !== session.sub) notFound(); // 不暴露存在性

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