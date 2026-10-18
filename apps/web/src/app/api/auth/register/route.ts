/**
 * POST /api/auth/register — 邮箱密码注册
 * F1: 普通用户注册
 *
 * Body: { email, password, name }
 * 201: { ok: true, userId }
 * 400: { error: "validation", details: [...] }
 * 409: { error: "email_exists" }
 * 500: { error: "internal" }
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { registerSchema } from "@/lib/validation/auth";
import { createUser, findUserByEmail } from "@/lib/user-repo";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;

  // Reject duplicates early (clearer than relying on P2002)
  const existing = await findUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "email_exists" }, { status: 409 });
  }

  try {
    const user = await createUser({ email, password, name });
    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }
    console.error("[register] unexpected", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}