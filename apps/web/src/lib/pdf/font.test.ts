import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { listFontFiles, getFontFamily } from "./font";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

describe("font pipeline", () => {
  it("PDF 端需要的 5 个字体文件都已就位", () => {
    const required = [
      "NotoSansSC-Regular.otf",
      "NotoSansSC-Bold.otf",
      "NotoSerifSC-Regular.otf",
      "NotoSerifSC-Bold.otf",
      "LXGWWenKai-Regular.ttf",
    ];
    for (const f of required) {
      expect(existsSync(path.join(FONT_DIR, f)), `缺少字体 ${f}`).toBe(true);
    }
  });

  it("listFontFiles 覆盖三族全部文件", () => {
    const files = listFontFiles();
    expect(files).toContain("NotoSansSC-Regular.otf");
    expect(files).toContain("NotoSansSC-Bold.otf");
    expect(files).toContain("NotoSerifSC-Regular.otf");
    expect(files).toContain("NotoSerifSC-Bold.otf");
    expect(files).toContain("LXGWWenKai-Regular.ttf");
  });

  it("字体族名按 key 映射到 react-pdf 的 family", () => {
    expect(getFontFamily("sans")).toBe("Noto Sans SC");
    expect(getFontFamily("serif")).toBe("Noto Serif SC");
    expect(getFontFamily("kai")).toBe("LXGW WenKai");
    // 默认字体族保持向后兼容(旧调用点不传参)
    expect(getFontFamily()).toBe("Noto Sans SC");
  });
});
