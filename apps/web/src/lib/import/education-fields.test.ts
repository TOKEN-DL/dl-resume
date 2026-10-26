/**
 * 教育字段的字段定位。
 *
 * 实测踩过的坑:PDF 里学校名右对齐、专业左对齐,按 x 坐标抽出来的文本
 * 顺序会变成「专业 … 学校」,于是 school="通信工程"、
 * major="广东技术师范大学"。学校名有"大学/学院"后缀,是可靠锚点 ——
 * 哪怕它前面还跟着别的词,也不该被一起吞进学校名。
 */
import { describe, it, expect } from "vitest";
import { findTitleParts } from "./extract";

const parts = (tokens: string[]) => findTitleParts(tokens, "education");

describe("findTitleParts education", () => {
  it("标准顺序:学校 专业 学历", () => {
    const r = parts(["2020.09 - 2024.06", "广东技术师范大学", "通信工程", "本科"]);
    expect(r.first).toBe("广东技术师范大学");
    expect(r.third).toContain("通信工程");
    expect(r.second).toBe("本科");
  });

  it("顺序颠倒时仍按后缀锚定学校,专业不被吞进学校名", () => {
    const r = parts(["通信工程", "广东技术师范大学", "本科"]);
    expect(r.first).toBe("广东技术师范大学");
    expect(r.third).toContain("通信工程");
    expect(r.first).not.toContain("通信工程");
  });

  it("学校名前的地域前缀属于学校名", () => {
    const r = parts(["2020.09 - 2024.06", "广东", "技术师范大学", "通信工程", "本科"]);
    expect(r.first).toBe("广东技术师范大学");
  });

  it("多词英文学校名保持完整", () => {
    const r = parts(["2016.09 - 2020.06", "Peking", "University", "Computer Science", "B.S."]);
    expect(r.first).toBe("Peking University");
    expect(r.third).toContain("Computer Science");
  });
});
