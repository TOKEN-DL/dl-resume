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
    // 替换第 20 个字符 —— 它落在随机 IV 的 base64 里,IV 也参与 GCM 认证,
    // 所以改动它必然导致解密失败。
    //
    // 替换字符必须**保证与原字符不同**:原来固定写 "X",当该位恰好本来就是 "X"
    // 时这次「篡改」等于没改,解密正常通过 —— 用例就有约 1/64 的概率自己翻车
    // (base64 字母表里 X 的占比约 1/64)。
    const original = stored[20];
    const replacement = original === "X" ? "Y" : "X";
    const tampered = stored.slice(0, 20) + replacement + stored.slice(21);
    expect(tampered).not.toBe(stored);
    expect(() => decryptResumeData(tampered)).toThrow();
  });

  it("decrypt is deterministic for same stored", () => {
    const stored = encryptResumeData('{"a":1}');
    expect(decryptResumeData(stored)).toBe(decryptResumeData(stored));
  });
});