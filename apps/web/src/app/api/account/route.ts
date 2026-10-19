/**
 * /api/account DELETE — 账户注销,级联删除用户/简历/EncryptedDek.
 * F19
 *
 * 二步验证:
 *  1. session 中识别当前用户
 *  2. body 提供 password 用于二次确认
 *
 * Prisma schema 中 Resume 与 EncryptedDek 都有 onDelete: Cascade,
 * 删除 User 自动级联清理加密数据。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1).max(200),
  /** 必须显式确认 */
  confirm: z.literal("DELETE"),
});

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 验证密码防误操作
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "wrong_password" }, { status: 403 });

  // 删 User → cascade 自动删除 Resumes + EncryptedDek
  try {
    await prisma.user.delete({ where: { id: user.id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }

  // 清理 session cookie
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("dl_session");
  return res;
}