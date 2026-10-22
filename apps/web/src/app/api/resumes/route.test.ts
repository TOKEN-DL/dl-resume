import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/resumes —— 模板 id 的动态校验 + 范文预填。
 *
 * 模板集合从 3 个硬编码字面量扩展到 32 套注册表后,
 * 校验必须由注册表驱动,不能再用 z.enum。
 */

const createResumeMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/resume-repo", () => ({
  listResumesByUser: vi.fn(async () => []),
  createResume: (input: unknown) => createResumeMock(input),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resumes", () => {
  beforeEach(() => {
    createResumeMock.mockReset();
    createResumeMock.mockResolvedValue({ id: "r1", title: "t", template: "classic", data: "{}" });
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });
  });

  it("未登录返回 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(req({ title: "t" }));
    expect(res.status).toBe(401);
  });

  it("接受注册表内的模板 id", async () => {
    const res = await POST(req({ title: "t", template: "timeline-style" }));
    expect(res.status).toBe(201);
    expect(createResumeMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: "timeline-style", title: "t" }),
    );
  });

  it("接受全部 32 套模板 id", async () => {
    const { TEMPLATE_IDS } = await import("@/lib/templates");
    for (const id of TEMPLATE_IDS) {
      const res = await POST(req({ title: "t", template: id }));
      expect(res.status, id).toBe(201);
    }
  });

  it("拒绝注册表外的模板 id(400)", async () => {
    const res = await POST(req({ title: "t", template: "no-such-template" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("未知模板");
    expect(createResumeMock).not.toHaveBeenCalled();
  });

  it("缺省 template 时回退 classic", async () => {
    const res = await POST(req({ title: "t" }));
    expect(res.status).toBe(201);
    expect(createResumeMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: "classic" }),
    );
  });

  it("带 data 时把范文存进简历(明文 JSON 字符串)", async () => {
    const sample = {
      basics: { name: "陈默", email: "chenmo@example.com" },
      work: [{ id: "w1", company: "星云科技" }],
    };
    const res = await POST(req({ title: "t", template: "fresh-mint", data: sample }));
    expect(res.status).toBe(201);
    const arg = createResumeMock.mock.calls[0][0] as { data?: string };
    expect(typeof arg.data).toBe("string");
    expect(JSON.parse(arg.data!).basics.name).toBe("陈默");
    // 缺失字段由 repairResumeData 补齐
    expect(JSON.parse(arg.data!).skills).toEqual([]);
  });

  it("不带 data 时不写 data 字段", async () => {
    const res = await POST(req({ title: "t", template: "classic" }));
    expect(res.status).toBe(201);
    const arg = createResumeMock.mock.calls[0][0] as { data?: string };
    expect(arg.data).toBeUndefined();
  });
});
