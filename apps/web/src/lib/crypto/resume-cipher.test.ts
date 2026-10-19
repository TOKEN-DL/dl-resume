/**
 * Resume cipher 包装层测试 — 含明文 fallback 迁移场景.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { encryptResumeData, decryptResumeData, isEncrypted } from "./resume-cipher";
import { resetMasterKeyCache } from "./master-key";

describe("resume-cipher", () => {
  beforeEach(() => {
    process.env.APP_SECRET = "test-app-secret-for-cipher-1234567890";
    resetMasterKeyCache();
  });

  it("encrypts and decrypts a JSON payload", () => {
    const json = JSON.stringify({ basics: { name: "张三" }, work: [] });
    const stored = encryptResumeData(json);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("张三"); // 不会泄露明文
    expect(stored.startsWith("v1.enc:")).toBe(true);
    const back = decryptResumeData(stored);
    expect(back).toBe(json);
  });

  it("produces different stored values for same input (random IV)", () => {
    const json = JSON.stringify({ x: 1 });
    const a = encryptResumeData(json);
    const b = encryptResumeData(json);
    expect(a).not.toBe(b);
    expect(decryptResumeData(a)).toBe(json);
    expect(decryptResumeData(b)).toBe(json);
  });

  it("falls back to plaintext for legacy data", () => {
    const legacy = JSON.stringify({ basics: { name: "旧数据" } });
    // 旧数据不以前缀开头
    expect(isEncrypted(legacy)).toBe(false);
    const back = decryptResumeData(legacy);
    expect(back).toBe(legacy);
  });

  it("throws when ciphertext is tampered", () => {
    const stored = encryptResumeData("{}");
    // 替换中间的字符
    const tampered = stored.slice(0, 20) + "X" + stored.slice(21);
    expect(() => decryptResumeData(tampered)).toThrow();
  });

  it("decrypt is deterministic for same stored", () => {
    const stored = encryptResumeData('{"a":1}');
    expect(decryptResumeData(stored)).toBe(decryptResumeData(stored));
  });
});