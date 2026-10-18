/**
 * Auth utility tests — TDD for F1.
 * Tests written BEFORE implementation.
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

describe("hashPassword", () => {
  it("returns a non-empty string different from the input", async () => {
    const hash = await hashPassword("hunter2");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(20);
    expect(hash).not.toBe("hunter2");
  });

  it("produces different hashes for the same input (salted)", async () => {
    const a = await hashPassword("hunter2");
    const b = await hashPassword("hunter2");
    expect(a).not.toBe(b);
  });

  it("uses Argon2id format (starts with $argon2id$)", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const ok = await verifyPassword("correct horse battery staple", hash);
    expect(ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const ok = await verifyPassword("wrong password", hash);
    expect(ok).toBe(false);
  });

  it("rejects when hash is malformed (does not throw)", async () => {
    const ok = await verifyPassword("anything", "not-a-valid-argon2-hash");
    expect(ok).toBe(false);
  });

  it("rejects empty password against any hash", async () => {
    const hash = await hashPassword("nonempty");
    const ok = await verifyPassword("", hash);
    expect(ok).toBe(false);
  });
});