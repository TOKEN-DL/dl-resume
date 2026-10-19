/**
 * AES-256-GCM helpers.
 *
 * 简化方案(MVP):用部署者密钥(APP_SECRET)派生 master key,
 * 数据加密不依赖用户密码。这避免了"用户改密需重加密 DEK"的复杂度,
 * 仍满足"数据库 dump 中看不到明文"的核心要求。
 *
 * 严格 E2E(用户密码派生 KEK → 包装 DEK)将在 v1.1 引入,届时 EncryptedDek 表已就位。
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ALGO = "aes-256-gcm" as const;
export const IV_BYTES = 12; // GCM 推荐 12 字节
export const KEY_BYTES = 32; // AES-256
export const TAG_BYTES = 16;

export interface CipherEnvelope {
  /** base64(iv) */
  iv: string;
  /** base64(ciphertext + auth_tag) — tag append 到 ciphertext 末尾 */
  ct: string;
}

function toB64(buf: Buffer): string {
  return buf.toString("base64");
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, "base64");
}

/**
 * 用 32 字节 key 加密任意字符串,返回 envelope.
 * 每次调用生成新 IV(nonce),同一明文+同一 key 也得到不同密文。
 */
export function encryptString(plaintext: string, key: Buffer): CipherEnvelope {
  if (key.length !== KEY_BYTES) {
    throw new Error(`key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ctBuf = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: toB64(iv),
    ct: toB64(Buffer.concat([ctBuf, tag])),
  };
}

/**
 * 解密 envelope. 任何篡改(iv/ct/tag/明文)都会抛出,不会返回部分明文。
 */
export function decryptString(env: CipherEnvelope, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }
  if (!env?.iv || !env?.ct) throw new Error("invalid envelope");
  const iv = fromB64(env.iv);
  const blob = fromB64(env.ct);
  if (iv.length !== IV_BYTES) throw new Error("invalid iv length");
  if (blob.length < TAG_BYTES) throw new Error("ct too short");
  const ct = blob.subarray(0, blob.length - TAG_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** 序列化 envelope 为单 base64 字符串(便于存数据库) */
export function packEnvelope(env: CipherEnvelope): string {
  return `${env.iv}.${env.ct}`;
}

export function unpackEnvelope(packed: string): CipherEnvelope {
  const parts = packed.split(".");
  if (parts.length !== 2) throw new Error("invalid packed envelope: expected iv.ct");
  const [iv, ct] = parts;
  if (!iv || !ct) throw new Error("invalid packed envelope: empty segment");
  return { iv, ct };
}

/** 比较两个 buffer 是否恒等(时间安全) */
export function constTimeEq(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}