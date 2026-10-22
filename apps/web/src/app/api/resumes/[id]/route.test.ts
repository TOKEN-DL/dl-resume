import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * PATCH /api/resumes/[id] —— 模板 id 的动态校验。
 *
 * 编辑器内「换模板」走的就是这个路由。之前这里写死了
 * z.enum(["classic","modern","minimal"]),32 套模板里换任何一套都会被 400 拒绝,
 * 模板根本存不下来。现在改成由注册表驱动。
 */

const updateResumeMock = vi.fn();
const getSessionMock = vi.fn();
const assertOwnershipMock = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@/lib/resume-repo", () => ({
  assertOwnership: (id: string, sub: string) => assertOwnershipMock(id, sub),
  updateResume: (id: string, data: unknown) => updateResumeMock(id, data),
  deleteResume: vi.fn(),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { PATCH, POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/resumes/r1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "r1" }) };

describe("PATCH /api/resumes/[id]", () => {
  beforeEach(() => {
    updateResumeMock.mockReset();
    updateResumeMock.mockResolvedValue({ id: "r1", title: "t", template: "classic", data: "{}" });
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ sub: "u1", email: "a@b.c", isAdmin: false });
    assertOwnershipMock.mockReset();
    assertOwnershipMock.mockResolvedValue(undefined);
  });

  it("未登录返回 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PATCH(req({ template: "dark-tech" }), ctx);
    expect(res.status).toBe(401);
    expect(updateResumeMock).not.toHaveBeenCalled();
  });

  it("接受注册表内的模板 id", async () => {
    const res = await PATCH(req({ template: "timeline-style" }), ctx);
    expect(res.status).toBe(200);
    expect(updateResumeMock).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ template: "timeline-style" }),
    );
  });

  it("接受全部 32 套模板 id", async () => {
    const { TEMPLATE_IDS } = await import("@/lib/templates");
    for (const id of TEMPLATE_IDS) {
      const res = await PATCH(req({ template: id }), ctx);
      expect(res.status, id).toBe(200);
    }
    expect(updateResumeMock).toHaveBeenCalledTimes(TEMPLATE_IDS.length);
  });

  it("拒绝注册表外的模板 id(400)", async () => {
    const res = await PATCH(req({ template: "no-such-template" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("未知模板");
    expect(updateResumeMock).not.toHaveBeenCalled();
  });

  it("不传 template 时不校验模板(只改标题)", async () => {
    const res = await PATCH(req({ title: "新标题" }), ctx);
    expect(res.status).toBe(200);
    expect(updateResumeMock).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ title: "新标题" }),
    );
  });

  it("POST 别名(sendBeacon 用)同样接受新模板 id", async () => {
    const res = await POST(req({ template: "fresh-mint" }), ctx);
    expect(res.status).toBe(200);
    expect(updateResumeMock).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ template: "fresh-mint" }),
    );
  });
});
