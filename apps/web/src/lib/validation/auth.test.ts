import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "./auth";

describe("registerSchema", () => {
  it("accepts a valid input", () => {
    const r = registerSchema.safeParse({
      email: "user@example.com",
      password: "long-enough-password",
      name: "张三",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = registerSchema.safeParse({
      email: "not-an-email",
      password: "long-enough-password",
      name: "张三",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a short password (< 8 chars)", () => {
    const r = registerSchema.safeParse({
      email: "user@example.com",
      password: "short",
      name: "张三",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = registerSchema.safeParse({
      email: "user@example.com",
      password: "long-enough-password",
      name: "",
    });
    expect(r.success).toBe(false);
  });

  it("normalizes email to lowercase", () => {
    const r = registerSchema.safeParse({
      email: "USER@Example.COM",
      password: "long-enough-password",
      name: "张三",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("user@example.com");
    }
  });
});

describe("loginSchema", () => {
  it("accepts email + password", () => {
    const r = loginSchema.safeParse({
      email: "user@example.com",
      password: "any-password",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty email", () => {
    const r = loginSchema.safeParse({ email: "", password: "x" });
    expect(r.success).toBe(false);
  });
});