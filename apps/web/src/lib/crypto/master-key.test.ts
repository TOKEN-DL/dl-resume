/**
 * Master key 派生测试.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getMasterKey, resetMasterKeyCache } from "./master-key";

describe("getMasterKey", () => {
  beforeEach(() => {
    resetMasterKeyCache();
  });

  it("throws when APP_SECRET is missing", () => {
    const orig = process.env.APP_SECRET;
    delete process.env.APP_SECRET;
    resetMasterKeyCache();
    expect(() => getMasterKey()).toThrow(/APP_SECRET/);
    process.env.APP_SECRET = orig;
  });

  it("throws when APP_SECRET is too short", () => {
    process.env.APP_SECRET = "short";
    resetMasterKeyCache();
    expect(() => getMasterKey()).toThrow(/≥ 16/);
  });

  it("returns 32-byte key when APP_SECRET is valid", () => {
    process.env.APP_SECRET = "x".repeat(64);
    resetMasterKeyCache();
    const k = getMasterKey();
    expect(k.length).toBe(32);
  });

  it("is deterministic — same secret yields same key", () => {
    process.env.APP_SECRET = "fixed-secret-for-test-1234567890";
    resetMasterKeyCache();
    const a = getMasterKey();
    resetMasterKeyCache();
    const b = getMasterKey();
    expect(a.equals(b)).toBe(true);
  });

  it("different secrets yield different keys", () => {
    process.env.APP_SECRET = "secret-A-1234567890abcdef";
    resetMasterKeyCache();
    const a = getMasterKey();
    process.env.APP_SECRET = "secret-B-1234567890abcdef";
    resetMasterKeyCache();
    const b = getMasterKey();
    expect(a.equals(b)).toBe(false);
  });
});