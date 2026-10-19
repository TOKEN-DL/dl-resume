/**
 * Resume.data 字段加密/解密工具.
 *
 * 数据库中存储: {iv}.{ct} 格式(AES-256-GCM);
 * 旧格式(明文 JSON)自动识别,解密时 fallback 为原样返回 — 用于平滑迁移。
 */
import { getMasterKey } from "./master-key";
import { encryptString, decryptString, packEnvelope, unpackEnvelope } from "./aes";

const PREFIX_MARK = "v1.enc:"; // 显式标记,避免和旧明文混淆

/**
 * 加密 JSON 字符串 → 数据库存储格式.
 * 每次生成新 IV,即使相同明文也不同密文.
 */
export function encryptResumeData(plainJson: string): string {
  const env = encryptString(plainJson, getMasterKey());
  return PREFIX_MARK + packEnvelope(env);
}

/**
 * 解密数据库存储格式 → JSON 字符串.
 * 旧明文 JSON 自动识别并原样返回(迁移兼容).
 */
export function decryptResumeData(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX_MARK)) {
    // 旧明文数据 — fallback
    return stored;
  }
  const packed = stored.slice(PREFIX_MARK.length);
  const env = unpackEnvelope(packed);
  return decryptString(env, getMasterKey());
}

/** 探测 stored 是否加密格式 — 用于调试/迁移统计 */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX_MARK);
}