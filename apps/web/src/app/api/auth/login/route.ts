/**
 * POST /api/auth/login — 邮箱密码登录
 * F1
 */
import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { findUserByEmail } from "@/lib/user-repo";
import { verifyPassword } from "@/lib/auth";
import { signSession, setSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  // Always run a verify even if user is missing, to avoid timing oracle.
  const dummyHash =
    "$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);

  if (!user || !ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
  });
}