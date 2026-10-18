/**
 * Session management — minimal cookie-based session for F1.
 * Signs a JWT with `jose` and stores in HttpOnly cookie.
 *
 * F1: PRD 要求邮箱密码登录即可,不强制使用 Auth.js,这样:
 *  - 不引入额外依赖复杂度
 *  - 与 F18 服务端加密更好配合(密钥派生复用)
 *  - E2E 简单
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "dl_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const s = process.env.NEXTAUTH_SECRET || process.env.APP_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET or APP_SECRET must be set");
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  isAdmin: boolean;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;