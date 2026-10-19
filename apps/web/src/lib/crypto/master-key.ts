/**
 * Master key 派生 — 从 APP_SECRET env 派生 32 字节 AES key.
 *
 * APP_SECRET 应当是 ≥ 32 字节随机字符串(类似 openssl rand -base64 32)。
 * MVP 方案: master key 由部署者掌握,用户密码变更不影响加密。
 */
import { createHash } from "node:crypto";
import { KEY_BYTES } from "./aes";

let cached: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (cached) return cached;
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET env must be set to a strong random string (≥ 16 chars). " +
        "Generate with `openssl rand -base64 32`",
    );
  }
  cached = createHash("sha256").update(`dl-resume-master-key:${secret}`).digest();
  if (cached.length !== KEY_BYTES) {
    throw new Error(`derived master key length mismatch: ${cached.length}`);
  }
  return cached;
}

/** 测试用 — 清空缓存使重新读取 env */
export function resetMasterKeyCache(): void {
  cached = null;
}