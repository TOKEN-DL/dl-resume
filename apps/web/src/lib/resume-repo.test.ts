/**
 * Resume repository tests — F2
 * TDD: write tests first, then make them pass.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Prisma } from "@prisma/client";

interface ResumeRow {
  id: string;
  userId: string;
  title: string;
  template: string;
  data: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory mock store keyed by `${userId}::${id}`
const store = new Map<string, ResumeRow>();
let idSeq = 1;
const newId = () => "r_" + (idSeq++).toString().padStart(4, "0");

/** 复刻 Prisma 的 "not found" 错误对象 —— 比 P2025 字面值更紧凑 */
const prismaNotFound = (): Error & { code: "P2025" } => {
  const err = new Error("Not found") as Error & { code: "P2025" };
  err.code = "P2025";
  return err;
};

vi.mock("./prisma", () => ({
  prisma: {
    resume: {
      // 这里只关心 mock 实现本身,类型用 Prisma 的正经 args 套在签名上,
      // 真实 prisma client 会被 vitest 自动按这些 args 形状校验调用方。
      // mock 实现内部把 Args 解构成自己看得懂的形状跑测试即可。
      findMany: vi.fn(async (args: Prisma.ResumeFindManyArgs) => {
        const where = args.where as { userId?: string } | undefined;
        const orderBy = args.orderBy as { updatedAt?: "asc" | "desc" } | undefined;
        const all = Array.from(store.values()).filter(
          (r) => !where?.userId || r.userId === where.userId,
        );
        if (orderBy?.updatedAt === "desc") {
          all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        return all;
      }),
      findUnique: vi.fn(async (args: Prisma.ResumeFindUniqueArgs) => {
        const id = (args.where as { id: string }).id;
        return store.get(id) ?? null;
      }),
      create: vi.fn(async (args: Prisma.ResumeCreateArgs) => {
        const d = args.data as Omit<ResumeRow, "id" | "createdAt" | "updatedAt">;
        const row: ResumeRow = {
          id: newId(),
          userId: d.userId,
          title: d.title,
          template: d.template ?? "classic",
          data: d.data ?? "{}",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(row.id, row);
        return row;
      }),
      update: vi.fn(async (args: Prisma.ResumeUpdateArgs) => {
        const id = (args.where as { id: string }).id;
        const row = store.get(id);
        if (!row) throw prismaNotFound();
        const patch = args.data as Partial<Omit<ResumeRow, "id" | "createdAt" | "updatedAt">>;
        const next: ResumeRow = { ...row, ...patch, updatedAt: new Date() };
        store.set(id, next);
        return next;
      }),
      delete: vi.fn(async (args: Prisma.ResumeDeleteArgs) => {
        const id = (args.where as { id: string }).id;
        const row = store.get(id);
        if (!row) throw prismaNotFound();
        store.delete(id);
        return row;
      }),
    },
  },
}));

import {
  listResumesByUser,
  findResumeById,
  createResume,
  updateResume,
  deleteResume,
  duplicateResume,
  assertOwnership,
} from "./resume-repo";
import { isEncrypted } from "./crypto/resume-cipher";
import { prisma } from "./prisma";

beforeEach(() => {
  store.clear();
  idSeq = 1;
});

describe("createResume", () => {
  it("creates a new resume with empty data by default", async () => {
    const r = await createResume({ userId: "u1", title: "我的第一份" });
    expect(r.userId).toBe("u1");
    expect(r.title).toBe("我的第一份");
    expect(r.template).toBe("classic");
    expect(r.data).toBe("{}");
  });

  it("accepts a custom template", async () => {
    const r = await createResume({ userId: "u1", title: "T", template: "modern" });
    expect(r.template).toBe("modern");
  });
});

describe("listResumesByUser", () => {
  it("returns empty array when user has no resumes", async () => {
    const list = await listResumesByUser("u1");
    expect(list).toEqual([]);
  });

  it("returns only the user's resumes (scoped)", async () => {
    await createResume({ userId: "u1", title: "A" });
    await createResume({ userId: "u2", title: "B" });
    await createResume({ userId: "u1", title: "C" });
    const list = await listResumesByUser("u1");
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.userId === "u1")).toBe(true);
  });

  it("sorts by updatedAt desc (newest first)", async () => {
    const a = await createResume({ userId: "u1", title: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createResume({ userId: "u1", title: "B" });
    await new Promise((r) => setTimeout(r, 5));
    const c = await createResume({ userId: "u1", title: "C" });
    const list = await listResumesByUser("u1");
    expect(list[0].id).toBe(c.id);
    expect(list[1].id).toBe(b.id);
    expect(list[2].id).toBe(a.id);
  });
});

describe("findResumeById", () => {
  it("returns the resume if it exists", async () => {
    const r = await createResume({ userId: "u1", title: "A" });
    const found = await findResumeById(r.id);
    expect(found?.id).toBe(r.id);
  });
  it("returns null if not found", async () => {
    expect(await findResumeById("nonexistent")).toBeNull();
  });
});

describe("updateResume", () => {
  it("updates the title", async () => {
    const r = await createResume({ userId: "u1", title: "old" });
    const next = await updateResume(r.id, { title: "new" });
    expect(next.title).toBe("new");
  });

  it("throws P2025 when not found", async () => {
    await expect(updateResume("nonexistent", { title: "x" })).rejects.toThrow();
  });
});

describe("deleteResume", () => {
  it("removes the resume", async () => {
    const r = await createResume({ userId: "u1", title: "A" });
    await deleteResume(r.id);
    expect(await findResumeById(r.id)).toBeNull();
  });
});

describe("duplicateResume", () => {
  it("creates a new resume with the same data and '(副本)' suffix", async () => {
    const orig = await createResume({
      userId: "u1",
      title: "技术岗版",
      template: "modern",
    });
    const copy = await duplicateResume(orig.id, "u1");
    expect(copy.id).not.toBe(orig.id);
    expect(copy.title).toBe("技术岗版 · 副本");
    expect(copy.template).toBe("modern");
    expect(copy.userId).toBe("u1");
  });

  it("throws when source not found", async () => {
    await expect(duplicateResume("nonexistent", "u1")).rejects.toThrow();
  });
});

/**
 * F18 回归测试 — 曾发生过 PDF / JSON 导出 / 编辑器拿到密文导致内容全空。
 * 根因:这些读取路径绕过 repo 直接调 prisma,漏了 decrypt。
 * 修复:统一走 assertOwnership / findResumeById(内部解密)。
 */
describe("F18 cipher round-trip — 所有读取路径必须返回明文", () => {
  const payload = JSON.stringify({
    basics: { name: "张三", email: "zhang@example.com" },
    work: [{ id: "w1", company: "字节跳动" }],
  });

  it("createResume 写密文到 DB", async () => {
    const r = await createResume({ userId: "u1", title: "密文测试", data: payload });
    const raw = store.get(r.id)!;
    expect(isEncrypted(raw.data)).toBe(true);
    expect(raw.data).not.toContain("张三"); // DB 里不能有明文
  });

  it("findResumeById 返回明文", async () => {
    const r = await createResume({ userId: "u1", title: "T", data: payload });
    const got = await findResumeById(r.id);
    expect(got!.data).toBe(payload);
    expect(got!.data).toContain("张三");
  });

  it("assertOwnership 返回明文(编辑器和 PDF 导出都依赖它)", async () => {
    const r = await createResume({ userId: "u1", title: "T", data: payload });
    const got = await assertOwnership(r.id, "u1");
    expect(got.data).toBe(payload);
    expect(got.data).toContain("字节跳动");
  });

  it("listResumesByUser 每条都返回明文", async () => {
    await createResume({ userId: "u1", title: "A", data: payload });
    await createResume({ userId: "u1", title: "B", data: payload });
    const list = await listResumesByUser("u1");
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item.data).toBe(payload);
      expect(item.data).toContain("张三");
    }
  });

  it("updateResume 写回密文但读出明文", async () => {
    const r = await createResume({ userId: "u1", title: "T", data: payload });
    const updated = await updateResume(r.id, { data: payload });
    expect(updated.data).toBe(payload);
    expect(isEncrypted(store.get(r.id)!.data)).toBe(true);
  });

  it("duplicateResume 副本也能读到明文", async () => {
    const orig = await createResume({ userId: "u1", title: "T", data: payload });
    const copy = await duplicateResume(orig.id, "u1");
    expect(copy.data).toBe(payload);
  });

  it("legacy 明文数据仍可读(向后兼容)", async () => {
    const r = await createResume({ userId: "u1", title: "T" });
    // 模拟 F18 之前的旧数据:直接塞明文
    store.get(r.id)!.data = payload;
    const got = await assertOwnership(r.id, "u1");
    expect(got.data).toBe(payload);
  });

  it("assertOwnership 越权时抛 Forbidden", async () => {
    const r = await createResume({ userId: "u1", title: "T", data: payload });
    await expect(assertOwnership(r.id, "u2")).rejects.toThrow("Forbidden");
  });

  it("assertOwnership 找不到时抛 Resume not found", async () => {
    await expect(assertOwnership("nonexistent", "u1")).rejects.toThrow("Resume not found");
  });
});