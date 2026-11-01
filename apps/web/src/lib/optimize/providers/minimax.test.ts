/**
 * MiniMax provider 的纯函数部分。
 *
 * 模型客户端(抠 JSON / 剥思考块 / 读思考开关)的测试已经跟着实现
 * 一起搬到共享模块 @/lib/llm/chat 的测试里了,那里才是它们的地盘。
 * 这里只留优化模块自己的部分:发给模型前怎么裁剪简历数据。
 */
import { describe, it, expect } from "vitest";
import { stripHeavyFields } from "./provider";
import { EMPTY_RESUME_DATA } from "@/lib/validation/resume";

describe("stripHeavyFields", () => {
  it("发给模型前会去掉头像(base64 太占地方)", () => {
    const data = {
      ...EMPTY_RESUME_DATA,
      basics: { ...EMPTY_RESUME_DATA.basics, avatar: "data:image/png;base64,AAAA" },
    };
    expect(stripHeavyFields(data).basics.avatar).toBe("");
    // 原对象不能被改
    expect(data.basics.avatar).toBe("data:image/png;base64,AAAA");
  });
});
