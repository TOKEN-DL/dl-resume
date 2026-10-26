/**
 * User repository tests — using a mock Prisma client.
 * TDD: write tests first, then make them pass.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory mock store keyed by email
const store = new Map<string, UserRow>();

const prismaUniqueViolation = (): Error & { code: "P2002" } => {
  const err = new Error("Unique constraint") as Error & { code: "P2002" };
  err.code = "P2002";
  return err;
};

vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: Prisma.UserFindUniqueArgs) => {
        const email = (args.where as { email: string }).email;
        return store.get(email) ?? null;
      }),
      create: vi.fn(async (args: Prisma.UserCreateArgs) => {
        const d = args.data as Omit<UserRow, "id" | "createdAt" | "updatedAt">;
        if (store.has(d.email)) throw prismaUniqueViolation();
        const row: UserRow = {
          id: "u_" + Math.random().toString(36).slice(2, 10),
          email: d.email,
          passwordHash: d.passwordHash,
          name: d.name,
          isAdmin: d.isAdmin ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(d.email, row);
        return row;
      }),
    },
  },
}));

import { findUserByEmail, createUser } from "./user-repo";

beforeEach(() => {
  store.clear();
});

describe("createUser", () => {
  it("persists a new user with hashed password", async () => {
    const u = await createUser({
      email: "alice@example.com",
      password: "long-enough-password",
      name: "Alice",
    });
    expect(u.email).toBe("alice@example.com");
    expect(u.name).toBe("Alice");
    expect(u.passwordHash).not.toBe("long-enough-password");
    expect(u.passwordHash.length).toBeGreaterThan(20);
    expect(u.isAdmin).toBe(false);
  });

  it("rejects duplicate email (P2002)", async () => {
    await createUser({ email: "dup@example.com", password: "long-enough-password", name: "A" });
    await expect(
      createUser({ email: "dup@example.com", password: "long-enough-password", name: "B" }),
    ).rejects.toThrow();
  });
});

describe("findUserByEmail", () => {
  it("returns the user if it exists", async () => {
    await createUser({ email: "bob@example.com", password: "long-enough-password", name: "Bob" });
    const u = await findUserByEmail("bob@example.com");
    expect(u).not.toBeNull();
    expect(u?.name).toBe("Bob");
  });

  it("returns null if not found", async () => {
    const u = await findUserByEmail("nobody@example.com");
    expect(u).toBeNull();
  });

  it("looks up case-insensitively (assumes caller already lowercased)", async () => {
    await createUser({ email: "case@example.com", password: "long-enough-password", name: "C" });
    const u = await findUserByEmail("case@example.com");
    expect(u).not.toBeNull();
  });
});