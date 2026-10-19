/**
 * AES-256-GCM + envelope 序列化测试.
 */
import { describe, it, expect } from "vitest";
import {
  encryptString,
  decryptString,
  packEnvelope,
  unpackEnvelope,
  IV_BYTES,
  KEY_BYTES,
} from "./aes";
import { randomBytes } from "node:crypto";

function key(): Buffer {
  return randomBytes(KEY_BYTES);
}

describe("encryptString/decryptString — round-trip", () => {
  it("decrypts back to original UTF-8", () => {
    const k = key();
    const env = encryptString("张三的简历数据", k);
    expect(decryptString(env, k)).toBe("张三的简历数据");
  });

  it("decrypts empty string", () => {
    const k = key();
    const env = encryptString("", k);
    expect(decryptString(env, k)).toBe("");
  });

  it("decrypts large JSON-like string", () => {
    const k = key();
    const json = JSON.stringify({ basics: { name: "李四" }, work: [{ company: "字节跳动" }] });
    const env = encryptString(json, k);
    expect(decryptString(env, k)).toBe(json);
  });
});

describe("encryptString — non-deterministic", () => {
  it("two encryptions of same plaintext yield different IVs/ct", () => {
    const k = key();
    const a = encryptString("same", k);
    const b = encryptString("same", k);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("decryptString — tampering detection", () => {
  it("throws when ciphertext is tampered", () => {
    const k = key();
    const env = encryptString("机密数据", k);
    // flip one byte in ct
    const tampered = {
      ...env,
      ct: Buffer.concat([Buffer.from(env.ct, "base64").subarray(0, 5), Buffer.from([0]), Buffer.from(env.ct, "base64").subarray(6)]).toString("base64"),
    };
    expect(() => decryptString(tampered, k)).toThrow();
  });

  it("throws when IV is modified", () => {
    const k = key();
    const env = encryptString("x", k);
    const ivBuf = Buffer.from(env.iv, "base64");
    ivBuf[0] = ivBuf[0] ^ 0xff;
    const tampered = { ...env, iv: ivBuf.toString("base64") };
    expect(() => decryptString(tampered, k)).toThrow();
  });

  it("throws with wrong key", () => {
    const k1 = key();
    const k2 = key();
    const env = encryptString("secret", k1);
    expect(() => decryptString(env, k2)).toThrow();
  });

  it("throws when key length is wrong", () => {
    const k = randomBytes(16);
    expect(() => encryptString("x", k)).toThrow(/32 bytes/);
  });
});

describe("pack/unpack envelope", () => {
  it("round-trips packed envelope", () => {
    const k = key();
    const env = encryptString("data", k);
    const packed = packEnvelope(env);
    expect(packed).toContain(".");
    const unpacked = unpackEnvelope(packed);
    expect(decryptString(unpacked, k)).toBe("data");
  });

  it("rejects malformed packed envelope", () => {
    expect(() => unpackEnvelope("no-dot")).toThrow();
    expect(() => unpackEnvelope("only.one.dot.here")).toThrow();
  });
});

describe("IV bytes constant", () => {
  it("is 12 bytes (GCM recommendation)", () => {
    expect(IV_BYTES).toBe(12);
  });
});