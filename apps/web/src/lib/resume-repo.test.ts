/**
 * Resume repository tests — F2
 * TDD: write tests first, then make them pass.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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

vi.mock("./prisma", () => ({
  prisma: {
    resume: {
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        const all = Array.from(store.values()).filter(
          (r) => !where?.userId || r.userId === where.userId,
        );
        if (orderBy?.updatedAt === "desc") {
          all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        return all;
      }),
      findUnique: vi.fn(async ({ where: { id } }: any) => store.get(id) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const row: ResumeRow = {
          id: newId(),
          userId: data.userId,
          title: data.title,
          template: data.template ?? "classic",
          data: data.data ?? "{}",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where: { id }, data }: any) => {
        const row = store.get(id);
        if (!row) {
          const err: any = new Error("Not found");
          err.code = "P2025";
          throw err;
        }
        const next = { ...row, ...data, updatedAt: new Date() };
        store.set(id, next);
        return next;
      }),
      delete: vi.fn(async ({ where: { id } }: any) => {
        const row = store.get(id);
        if (!row) {
          const err: any = new Error("Not found");
          err.code = "P2025";
          throw err;
        }
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
} from "./resume-repo";

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