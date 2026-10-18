/**
 * Authentication utilities — password hashing with Argon2id.
 * F1: 邮箱密码注册/登录 + 启动时 seed 管理员账号(见 PRD §2.1)
 *
 * Algorithm: Argon2id (RFC 9106) — winner of the Password Hashing Competition.
 * Recommended parameters from OWASP 2024:
 *   - memoryCost: 19456 KiB (~19 MB)
 *   - timeCost:   2
 *   - parallelism: 1
 *   - hashLength: 32 bytes
 */
import { hash, verify } from "@node-rs/argon2";

// Algorithm values from @node-rs/argon2 const enum
// (we can't import the const enum directly because tsconfig has isolatedModules)
// 0 = Argon2d, 1 = Argon2i, 2 = Argon2id
const ARGON2ID = 2;

const ARGON2_OPTS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error("hashPassword: plain must be non-empty");
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(
  plain: string,
  storedHash: string,
): Promise<boolean> {
  if (!plain || !storedHash) return false;
  try {
    return await verify(storedHash, plain, ARGON2_OPTS);
  } catch {
    // Malformed hash, version mismatch, etc.
    return false;
  }
}