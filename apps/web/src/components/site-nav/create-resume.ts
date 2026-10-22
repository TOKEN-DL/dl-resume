/**
 * 「创建简历」的共用逻辑。
 *
 * 导航下拉里的主 CTA、首页 Hero / 底部的 CTA 都指向同一个 POST /api/resumes,
 * 这里把「未登录 / 服务端拒绝 / 网络异常」收敛成结构化结果,
 * 让调用方只关心两件事:拿到 id 去编辑器,还是把人送去登录页。
 *
 * 刻意不放 React 依赖 —— 纯函数,方便单测。
 */

export type CreateResumeResult =
  | { ok: true; id: string }
  | { ok: false; reason: "unauthorized" | "failed"; message: string };

export async function createResume(
  title = "未命名简历",
  template = "classic",
): Promise<CreateResumeResult> {
  try {
    const res = await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, template }),
    });

    if (res.status === 401) {
      return { ok: false, reason: "unauthorized", message: "请先登录再创建简历。" };
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: "failed",
        message: `创建失败(HTTP ${res.status}),请稍后重试。`,
      };
    }

    const payload = (await res.json().catch(() => null)) as
      | { resume?: { id?: string } }
      | null;
    const id = payload?.resume?.id;
    if (!id) {
      return {
        ok: false,
        reason: "failed",
        message: "创建成功但没有拿到简历 id,请刷新页面后重试。",
      };
    }
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      message: e instanceof Error ? e.message : "网络错误,请稍后重试。",
    };
  }
}
