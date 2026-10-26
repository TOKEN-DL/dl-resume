/**
 * /resumes/[id]/edit — 简历编辑器入口 (server component).
 * F3: 拉取简历,验证所有权,交给 EditorShell 渲染.
 * F20: 刚导入的简历会带 ?imported=1&missing=…,顶部提示需要补齐的字段.
 */
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { assertOwnership, type ResumeDecrypted } from "@/lib/resume-repo";
import { parseResumeData } from "@/lib/validation/resume";
import { EditorShell } from "@/components/editor/editor-shell";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function EditPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

  // 必须走 assertOwnership — 它内部会解密(F18),不要绕过 repo 直接查 prisma
  let resume: ResumeDecrypted;
  try {
    resume = await assertOwnership(id, session.sub);
  } catch {
    notFound(); // 不暴露存在性(找不到 / 非本人 一律 404)
  }

  const data = parseResumeData(resume.data);

  const imported = sp.imported === "1";
  const rawMissing = typeof sp.missing === "string" ? sp.missing : "";
  const missingFields = rawMissing
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  return (
    <EditorShell
      resumeId={resume.id}
      initialTitle={resume.title}
      initialTemplate={resume.template}
      initialData={data}
      initialSavedAt={resume.updatedAt.getTime()}
      imported={imported}
      missingFields={missingFields}
    />
  );
}