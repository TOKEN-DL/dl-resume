# 简历模板库（82 套模板 = 首批 32 套 + 扩展 50 套）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 dl-resume 新增模板库模块，提供 82 套视觉明显不同的简历模板（首批 32 套 + 扩展 50 套），支持从模板创建简历、编辑中换模板、预览与 PDF 双端对齐。

**Architecture:** 模板 = 数据（`TemplateDef`：`layout` 骨架 + `theme` token + 专属装饰层 + 范文）。HTML 端把 token 注入 CSS 变量、PDF 端把 token 喂给 `StyleSheet.create`，同一份 token 双端共用，从结构上消除预览/PDF 漂移。7 个骨架在 HTML 与 PDF 各有一份一一对应的实现。

**Tech Stack:** Next.js 15.5.28 App Router、React 19、TypeScript、Tailwind + CSS Modules、react-pdf v4.9、Prisma(SQLite)、Vitest、Playwright、@fontsource、lxgw-wenkai-webfont

**设计文档：** `docs/superpowers/specs/2026-10-22-resume-template-library-design.md`

## Global Constraints

- 工作目录：`D:\code\coding\dl-resume`，所有 npm 命令在 `apps/web` 下执行
- UI 文案与代码注释一律中文
- `prisma/schema.prisma` 的 `Resume.template` 是 `String @default("classic")` → **禁止新增 Prisma 迁移**
- PDF 内禁止 emoji（缺字形渲染为 .notdef 乱码），沿用 `documents.test.ts` 既有回归断言
- `apps/web/.next` 是生产输出、`apps/web/.next-dev` 是 dev 输出（本次会话前已分离），**禁止手工删除任一目录**
- 仓库工作区存在导入功能的在途改动（`src/lib/import/`、`src/components/import/`、`src/app/api/resumes/import/` 等）→ **禁止误改、误删、误提交**
- 提交时只 `git add` 本任务涉及的文件，禁止 `git add -A`
- 字体文件放在 `apps/web/public/fonts/`，已在 gitignore，禁止入库
- 新增依赖仅限：`@fontsource/noto-serif-sc`、`lxgw-wenkai-webfont`（均为 npm 公开包，已核实可用）
- 命令约定：`npm run typecheck`、`npm test`、`npm run build` 必须全绿才算完成

---

### Task 1: 字体管线（预览 / PDF / Docker 三处打通）

**Files:**
- Modify: `apps/web/scripts/setup-fonts.ts`
- Modify: `apps/web/src/lib/pdf/font.ts`
- Modify: `apps/web/Dockerfile`
- Modify: `apps/web/.dockerignore`
- Modify: `apps/web/public/fonts/README.md`
- Test: `apps/web/src/lib/pdf/font.test.ts`

**Interfaces:**
- Consumes: 无（起点任务）
- Produces:
  - `src/lib/pdf/font.ts` 导出 `registerFontsOnce(): Promise<void>`、`getFontFamily(font: FontKey): string`、`FONT_FAMILIES: Record<FontKey, string>`
  - `scripts/setup-fonts.ts` 导出 `FONT_MANIFEST`（供测试断言文件清单）

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/lib/pdf/font.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

describe("font pipeline", () => {
  it("注册所需的 5 个字体文件都已就位", () => {
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
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/lib/pdf/font.test.ts`
Expected: FAIL —— `缺少字体 NotoSansSC-Bold.otf` 等

- [ ] **Step 3: 重写 setup-fonts.ts 为清单驱动**

`apps/web/scripts/setup-fonts.ts` 全文替换为：

```ts
/**
 * setup-fonts: 下载 PDF 端需要嵌入的中文字体到 public/fonts/。
 *
 * 预览端用 @fontsource / webfont（node_modules，不走这里）；
 * 这里只服务 react-pdf 的服务端渲染。
 *
 * Usage: npm run setup:fonts
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "fonts");

export interface FontFile {
  file: string;
  url: string;
  /** 小于该字节数视为下载不完整 */
  minBytes: number;
}

export const FONT_MANIFEST: FontFile[] = [
  {
    file: "NotoSansSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSansSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSerifSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf",
    minBytes: 1_000_000,
  },
  {
    file: "NotoSerifSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf",
    minBytes: 1_000_000,
  },
  {
    file: "LXGWWenKai-Regular.ttf",
    url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.520/LXGWWenKai-Regular.ttf",
    minBytes: 5_000_000,
  },
];

async function alreadyThere(f: FontFile): Promise<boolean> {
  try {
    const s = await stat(path.join(OUT_DIR, f.file));
    return s.size > f.minBytes;
  } catch {
    return false;
  }
}

async function download(f: FontFile): Promise<void> {
  console.log(`[setup-fonts] downloading ${f.file}`);
  const res = await fetch(f.url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${f.file} 下载失败: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < f.minBytes) {
    throw new Error(`${f.file} 下载不完整: ${buf.length} 字节 < ${f.minBytes}`);
  }
  await writeFile(path.join(OUT_DIR, f.file), buf);
  console.log(`[setup-fonts] saved ${f.file} (${(buf.length / 1e6).toFixed(2)} MB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of FONT_MANIFEST) {
    if (await alreadyThere(f)) {
      console.log(`[setup-fonts] skip ${f.file} (已存在)`);
      continue;
    }
    await download(f);
  }
  console.log("[setup-fonts] 全部字体就绪");
}

main().catch((e) => {
  console.error("[setup-fonts] error", e);
  process.exit(1);
});
```

- [ ] **Step 4: 重写 font.ts 支持三族 + fail-fast**

`apps/web/src/lib/pdf/font.ts` 全文替换为：

```ts
/**
 * 字体注册 — react-pdf 在 Node.js 渲染时按需子集化嵌入.
 * 三族:Noto Sans SC(黑) / Noto Serif SC(宋) / LXGW WenKai(楷).
 * 缺失文件时抛出中文可读错误,而不是让 fontkit 抛英文底层异常.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import type * as Renderer from "@react-pdf/renderer";

export type PdfFontKey = "sans" | "serif" | "kai";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

const FAMILIES: Record<PdfFontKey, { family: string; files: Array<{ file: string; weight: 400 | 700 }> }> = {
  sans: {
    family: "Noto Sans SC",
    files: [
      { file: "NotoSansSC-Regular.otf", weight: 400 },
      { file: "NotoSansSC-Bold.otf", weight: 700 },
    ],
  },
  serif: {
    family: "Noto Serif SC",
    files: [
      { file: "NotoSerifSC-Regular.otf", weight: 400 },
      { file: "NotoSerifSC-Bold.otf", weight: 700 },
    ],
  },
  kai: {
    // 霞鹜文楷无独立 Bold,700 复用 Regular;若 PDF 端不合成粗体,
    // 楷体模板的标题层级改用色带 + 字号表达(见设计文档 6.4)
    family: "LXGW WenKai",
    files: [{ file: "LXGWWenKai-Regular.ttf", weight: 700 }],
  },
};

const FAMILY_BY_KEY: Record<PdfFontKey, string> = {
  sans: FAMILIES.sans.family,
  serif: FAMILIES.serif.family,
  kai: FAMILIES.kai.family,
};

/** 取 PDF 端字体族名(与预览端 lib/templates/fonts.ts 保持同一套 key) */
export function getFontFamily(key: PdfFontKey = "sans"): string {
  return FAMILY_BY_KEY[key];
}

export function listFontFiles(): string[] {
  return Object.values(FAMILIES).flatMap((f) => f.files.map((x) => x.file));
}

let registered = false;

export async function registerFontsOnce(): Promise<void> {
  if (registered) return;
  const missing = listFontFiles().filter((f) => !existsSync(path.join(FONT_DIR, f)));
  if (missing.length > 0) {
    throw new Error(
      `字体资源缺失: ${missing.join("、")}。请先运行 npm run setup:fonts 下载字体。`,
    );
  }
  const { Font } = await import("@react-pdf/renderer");
  for (const { family, files } of Object.values(FAMILIES)) {
    for (const { file, weight } of files) {
      const src = path.join(FONT_DIR, file);
      Font.register({ family, src, fontStyle: "normal", fontWeight: weight });
      if (weight === 400) {
        Font.register({ family, src, fontStyle: "italic", fontWeight: 400 });
      }
    }
  }
  registered = true;
}
```

- [ ] **Step 5: 下载字体**

Run: `cd apps/web && npm run setup:fonts`
Expected: 日志输出 5 个文件的下载/跳过，最终 `[setup-fonts] 全部字体就绪`

- [ ] **Step 6: 运行测试确认通过**

Run: `cd apps/web && npx vitest run src/lib/pdf/font.test.ts`
Expected: PASS

- [ ] **Step 7: 修复 Docker 字体管线**

`apps/web/Dockerfile` 的 builder 段，把

```
RUN npx prisma generate
RUN npm run build
```

改为

```
RUN npx prisma generate
RUN npm run setup:fonts
RUN npm run build
```

`apps/web/.dockerignore` 删除这两行（字体与 setup 脚本必须在镜像内）：

```
public/fonts/*.otf
public/fonts/*.ttf
public/fonts/*.woff
public/fonts/*.woff2
```

并把 `scripts/setup-fonts.ts` 从排除名单里移除（该行原本在 `scripts/setup-fonts.ts` 排除项中），改为放行。保留 `scripts/e2e-*.js` 的排除。

- [ ] **Step 8: 更新字体说明文档**

`apps/web/public/fonts/README.md` 重写为：列出 5 个文件名、来源 URL、用途（仅 PDF 端）、`npm run setup:fonts` 用法、缺失时的报错提示。

- [ ] **Step 9: 提交**

```bash
git add apps/web/scripts/setup-fonts.ts apps/web/src/lib/pdf/font.ts apps/web/src/lib/pdf/font.test.ts apps/web/Dockerfile apps/web/.dockerignore apps/web/public/fonts/README.md
git commit -m "fix: 字体管线补齐三族中文/真粗体并修复 Docker 镜像内缺字体"
```

---

### Task 2: 模板类型、字体映射与注册表

**Files:**
- Create: `apps/web/src/lib/templates/types.ts`
- Create: `apps/web/src/lib/templates/fonts.ts`
- Create: `apps/web/src/lib/templates/registry.ts`
- Create: `apps/web/src/lib/templates/index.ts`
- Test: `apps/web/src/lib/templates/registry.test.ts`

**Interfaces:**
- Consumes: `src/lib/pdf/font.ts` 的 `PdfFontKey`（Task 1 产出）
- Produces:
  - `types.ts`：`TemplateId`、`FontKey`、`LayoutKind`、`StyleGroup`、`SceneTag`、`RoleTag`、`ThemeTokens`、`TemplateDef`
  - `fonts.ts`：`FONT_STACKS: Record<FontKey, { html: string; pdf: string }>`
  - `registry.ts`：`TEMPLATES: TemplateDef[]`、`TEMPLATE_IDS`、`TEMPLATE_MAP`、`getTemplate(id: string): TemplateDef`、`isTemplateId(id: string): boolean`、`STYLE_GROUPS`、`SCENE_TAGS`、`ROLE_TAGS`
  - `index.ts`：re-export 上述全部

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/lib/templates/registry.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  TEMPLATE_IDS,
  getTemplate,
  isTemplateId,
  STYLE_GROUPS,
} from "./registry";
import { ResumeDataSchema } from "@/lib/validation/resume";

describe("template registry", () => {
  it("模板数量不少于 30 套", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it("id 唯一且为 kebab-case", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
    for (const id of TEMPLATE_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it("存量三个模板 id 保留", () => {
    for (const id of ["classic", "modern", "minimal"]) {
      expect(isTemplateId(id)).toBe(true);
    }
  });

  it("任意两套的 骨架+主色+字体+标题形态 四元组不重复", () => {
    const seen = new Set<string>();
    for (const t of TEMPLATES) {
      const key = `${t.layout}|${t.theme.accent}|${t.theme.font}|${t.theme.heading}`;
      expect(seen.has(key), `重复组合: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("未知 id 回退到 classic", () => {
    expect(getTemplate("not-exist").id).toBe("classic");
    expect(getTemplate("classic").id).toBe("classic");
  });

  it("每套模板的范文通过 schema 校验", () => {
    for (const t of TEMPLATES) {
      const r = ResumeDataSchema.safeParse(t.sample);
      expect(r.success, `${t.id} 范文不合法: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("风格组都在枚举内", () => {
    for (const t of TEMPLATES) {
      expect(STYLE_GROUPS.some((g) => g.key === t.group)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/lib/templates/registry.test.ts`
Expected: FAIL —— `Cannot find module '@/lib/templates/registry'`

- [ ] **Step 3: 创建 types.ts**

`apps/web/src/lib/templates/types.ts`：

```ts
import type { ResumeData } from "@/lib/validation/resume";

export type FontKey = "sans" | "serif" | "kai";

export type LayoutKind =
  | "single-classic"
  | "single-modern"
  | "sidebar-left"
  | "sidebar-right"
  | "two-column"
  | "timeline"
  | "card-grid";

export type StyleGroup =
  | "minimal"
  | "business"
  | "modern"
  | "fresh"
  | "elegant"
  | "creative"
  | "functional"
  | "academic";

export type SceneTag = "general" | "campus" | "social" | "intern" | "student";
export type RoleTag =
  | "frontend"
  | "backend"
  | "product"
  | "operation"
  | "design"
  | "algorithm"
  | "data"
  | "qa"
  | "research"
  | "finance";

export type HeadingStyle = "rule" | "band" | "bar" | "plain" | "underline" | "index" | "serif";
export type SkillStyle = "dots" | "bars" | "tags" | "plain";
export type AvatarStyle = "circle" | "square" | "rounded" | "none";
export type NameStyle = "plain" | "underline" | "band" | "big";

export interface ThemeTokens {
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  border: string;
  paper: string;
  font: FontKey;
  fontScale: number;
  lineHeight: number;
  radius: number;
  heading: HeadingStyle;
  skill: SkillStyle;
  avatar: AvatarStyle;
  nameStyle: NameStyle;
}

export interface TemplateDef {
  id: string;
  name: string;
  group: StyleGroup;
  layout: LayoutKind;
  theme: ThemeTokens;
  scenes: SceneTag[];
  roles: RoleTag[];
  summary: string;
  sample: ResumeData;
  legacy?: boolean;
}
```

- [ ] **Step 4: 创建 fonts.ts**

`apps/web/src/lib/templates/fonts.ts`：

```ts
import type { FontKey } from "./types";

export const FONT_STACKS: Record<FontKey, { html: string; pdf: string }> = {
  sans: { html: '"Noto Sans SC", system-ui, -apple-system, sans-serif', pdf: "Noto Sans SC" },
  serif: { html: '"Noto Serif SC", "Songti SC", serif', pdf: "Noto Serif SC" },
  kai: { html: '"LXGW WenKai", "Kaiti SC", serif', pdf: "LXGW WenKai" },
};
```

- [ ] **Step 5: 创建 registry.ts（32 条）**

`apps/web/src/lib/templates/registry.ts`：先写标签与分组元数据，再写 32 条 `TemplateDef`。

> `TemplateId` 的窄化联合放在 registry.ts（`export type TemplateId = (typeof TEMPLATE_IDS)[number]`），
> 避免 types.ts ↔ registry.ts 循环依赖；`TemplateDef.id` 保持 `string`。

```ts
import type {
  TemplateDef, StyleGroup, SceneTag, RoleTag,
} from "./types";
import { SAMPLE_PROFESSIONAL, SAMPLE_STUDENT, SAMPLE_CREATIVE } from "./samples";

export const STYLE_GROUPS: Array<{ key: StyleGroup; label: string }> = [
  { key: "minimal", label: "极简黑白" },
  { key: "business", label: "商务经典" },
  { key: "modern", label: "现代科技" },
  { key: "fresh", label: "清新雅致" },
  { key: "elegant", label: "优雅高级" },
  { key: "creative", label: "创意个性" },
  { key: "functional", label: "简洁实用" },
  { key: "academic", label: "学术稳重" },
];

export const SCENE_TAGS: Array<{ key: SceneTag; label: string }> = [
  { key: "general", label: "通用" },
  { key: "campus", label: "校招" },
  { key: "social", label: "社招" },
  { key: "intern", label: "实习" },
  { key: "student", label: "大学生" },
];

export const ROLE_TAGS: Array<{ key: RoleTag; label: string }> = [
  { key: "frontend", label: "前端" },
  { key: "backend", label: "后端" },
  { key: "product", label: "产品" },
  { key: "operation", label: "运营" },
  { key: "design", label: "设计" },
  { key: "algorithm", label: "算法" },
  { key: "data", label: "数据" },
  { key: "qa", label: "测试" },
  { key: "research", label: "科研" },
  { key: "finance", label: "金融" },
];

/** 主题默认值,各模板在此基础上覆盖 */
const BASE_THEME = {
  accentSoft: "#eef2ff",
  ink: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  paper: "#ffffff",
  fontScale: 1,
  lineHeight: 1.55,
  radius: 4,
  heading: "rule",
  skill: "dots",
  avatar: "none",
  nameStyle: "plain",
} as const;

export const TEMPLATES: TemplateDef[] = [ /* 32 条，见下方清单 */ ];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): TemplateDef {
  return TEMPLATE_MAP.get(id) ?? TEMPLATE_MAP.get("classic")!;
}

export function isTemplateId(id: string): boolean {
  return TEMPLATE_MAP.has(id);
}
```

32 条模板数据**严格按设计文档第 3 节的表格填写**（id / name / group / layout / theme 全字段 / scenes / roles / summary / sample / legacy）。主题 token 的补充色按调色规则推导：`accentSoft` = accent 的 10% 淡化值，`border` = accent 的 30% 淡化值（当 accent 非灰阶时），其余继承 `BASE_THEME`。三套存量模板的 `theme` 必须取自现有 CSS 的实际值：

| id | accent | accentSoft | ink | muted | border | font | heading | skill | avatar | nameStyle |
|---|---|---|---|---|---|---|---|---|---|---|
| `classic` | `#0f172a` | `#f1f5f9` | `#0f172a` | `#64748b` | `#cbd5e1` | serif | rule | dots | none | plain |
| `modern` | `#1e40af` | `#eff6ff` | `#0f172a` | `#4b5563` | `#d4d8de` | sans | bar | dots | none | plain |
| `minimal` | `#4b5563` | `#f9fafb` | `#374151` | `#9ca3af` | `#e5e7eb` | sans | plain | plain | none | plain |

> 实施时必须打开 `apps/web/src/components/editor/templates.module.css` 核对 `.tpl_classic` / `.tpl_modern` / `.tpl_minimal` 的实际 CSS 变量值填入上表，**不得凭印象填写**。存量三套的外观不得改变。

- [ ] **Step 6: 创建 index.ts**

```ts
export * from "./types";
export * from "./fonts";
export * from "./registry";
export { SAMPLE_PROFESSIONAL, SAMPLE_STUDENT, SAMPLE_CREATIVE } from "./samples";
```

- [ ] **Step 7: 提交（注册表骨架，数据留到 Task 3 后补全）**

```bash
git add apps/web/src/lib/templates
git commit -m "feat: 模板类型定义与注册表骨架"
```

---

### Task 3: 范文数据

**Files:**
- Create: `apps/web/src/lib/templates/samples.ts`
- Test: `apps/web/src/lib/templates/samples.test.ts`

**Interfaces:**
- Consumes: `ResumeDataSchema`、`newId`（`@/lib/validation/resume`）
- Produces: `SAMPLE_PROFESSIONAL: ResumeData`、`SAMPLE_STUDENT: ResumeData`、`SAMPLE_CREATIVE: ResumeData`

- [ ] **Step 1: 写失败测试**

`apps/web/src/lib/templates/samples.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { ResumeDataSchema } from "@/lib/validation/resume";
import { SAMPLE_PROFESSIONAL, SAMPLE_STUDENT, SAMPLE_CREATIVE } from "./samples";

const ALL = { SAMPLE_PROFESSIONAL, SAMPLE_STUDENT, SAMPLE_CREATIVE };

describe("sample resumes", () => {
  it("三份范文都通过 schema 校验", () => {
    for (const [name, s] of Object.entries(ALL)) {
      const r = ResumeDataSchema.safeParse(s);
      expect(r.success, `${name}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("姓名、职位、联系方式非空", () => {
    for (const [name, s] of Object.entries(ALL)) {
      expect(s.basics.name, name).not.toBe("");
      expect(s.basics.label, name).not.toBe("");
      expect(s.basics.email, name).not.toBe("");
      expect(s.basics.phone, name).not.toBe("");
    }
  });

  it("至少包含工作或项目、学历、技能", () => {
    for (const [name, s] of Object.entries(ALL)) {
      expect(s.work.length + s.projects.length, name).toBeGreaterThan(0);
      expect(s.education.length, name).toBeGreaterThan(0);
      expect(s.skills.length, name).toBeGreaterThan(0);
    }
  });

  it("三份范文的 id 互不重复", () => {
    const ids = Object.values(ALL).flatMap((s) => [
      ...s.work.map((x) => x.id),
      ...s.education.map((x) => x.id),
      ...s.projects.map((x) => x.id),
      ...s.skills.map((x) => x.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/lib/templates/samples.test.ts`
Expected: FAIL —— `Cannot find module './samples'`

- [ ] **Step 3: 写三份范文**

`apps/web/src/lib/templates/samples.ts`：实现 `SAMPLE_PROFESSIONAL`（3 段工作 + 2 段项目 + 学历 + 6 项技能 + 语言 + 奖项 + 证书 + 兴趣）、`SAMPLE_STUDENT`（学生/实习导向）、`SAMPLE_CREATIVE`（设计师/作品集导向）。每条记录的 `id` 用 `newId("work")` 之类的唯一前缀生成，字段结构严格对齐 `ResumeDataSchema`。description 用带 `<ul><li>` 的富文本 HTML（与编辑器产出一致），例如：

```ts
description:
  "<p>负责企业级中后台产品的前端架构与性能优化。</p>" +
  "<ul><li>主导微前端改造，首屏加载从 3.2s 降至 1.1s</li>" +
  "<li>沉淀 12 个业务组件，跨团队复用率提升到 65%</li></ul>",
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && npx vitest run src/lib/templates/samples.test.ts src/lib/templates/registry.test.ts`
Expected: PASS（若 registry 测试因范文未接入而失败，说明 Task 2 的 32 条数据缺 `sample` 字段，补齐后重跑）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/templates
git commit -m "feat: 三份模板范文数据"
```

---

### Task 4: HTML 渲染器（7 骨架 + token 驱动）

**Files:**
- Create: `apps/web/src/components/editor/template-renderer.tsx`
- Create: `apps/web/src/components/editor/layouts/single-classic.tsx`
- Create: `apps/web/src/components/editor/layouts/single-modern.tsx`
- Create: `apps/web/src/components/editor/layouts/sidebar-left.tsx`
- Create: `apps/web/src/components/editor/layouts/sidebar-right.tsx`
- Create: `apps/web/src/components/editor/layouts/two-column.tsx`
- Create: `apps/web/src/components/editor/layouts/timeline.tsx`
- Create: `apps/web/src/components/editor/layouts/card-grid.tsx`
- Create: `apps/web/src/components/editor/layout-parts.tsx`（共享部件）
- Rewrite: `apps/web/src/components/editor/templates.tsx`（改为薄壳，导出 `TemplatePreview`）
- Rewrite: `apps/web/src/components/editor/templates.module.css`

**Interfaces:**
- Consumes: `getTemplate(id)`、`TemplateDef`、`ThemeTokens`、`FONT_STACKS`
- Produces:
  - `template-renderer.tsx` 导出 `TemplateRenderer({ def, data }: { def: TemplateDef; data: ResumeData })`
  - `templates.tsx` 导出 `TemplatePreview({ data, template }: { data: ResumeData; template: string })` —— 内部 `getTemplate(template)` 兜底
  - `layouts/parts.tsx` 导出 `SectionBlock`、`PeriodEntry`、`SkillList`、`HeaderBlock`、`RichHtml`、`toCssVars(theme)`

- [ ] **Step 1: 写失败测试**

创建 `apps/web/src/components/editor/template-renderer.test.tsx`（用 `react-dom/server` 渲染为字符串做结构断言）：

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateRenderer } from "./template-renderer";
import { getTemplate } from "@/lib/templates";
import { SAMPLE_PROFESSIONAL } from "@/lib/templates/samples";

describe("TemplateRenderer", () => {
  it("每套模板都能渲染出姓名", () => {
    for (const id of ["classic", "modern", "minimal", "navy-elegant", "timeline-style", "designer"]) {
      const html = renderToStaticMarkup(
        <TemplateRenderer def={getTemplate(id)} data={SAMPLE_PROFESSIONAL} />,
      );
      expect(html, id).toContain("陈默");
    }
  });

  it("token 注入为 CSS 变量", () => {
    const def = getTemplate("modern");
    const html = renderToStaticMarkup(<TemplateRenderer def={def} data={SAMPLE_PROFESSIONAL} />);
    expect(html).toContain("--accent");
    expect(html).toContain(def.theme.accent);
  });

  it("空数据不报错", () => {
    const html = renderToStaticMarkup(
      <TemplateRenderer def={getTemplate("classic")} data={{ basics: { name: "" }, summary: "", work: [], education: [], projects: [], skills: [], languages: [], awards: [], certificates: [], interests: "" } as never} />,
    );
    expect(html).toContain("未填写姓名");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/components/editor/template-renderer.test.tsx`
Expected: FAIL —— `Cannot find module './template-renderer'`

- [ ] **Step 3: 实现 token → CSS 变量**

`layout-parts.tsx` 中：

```tsx
export function toCssVars(theme: ThemeTokens): React.CSSProperties {
  return {
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--border": theme.border,
    "--paper": theme.paper,
    "--font-scale": String(theme.fontScale),
    "--line-height": String(theme.lineHeight),
    "--radius": `${theme.radius}px`,
    "--font": FONT_STACKS[theme.font].html,
  } as React.CSSProperties;
}
```

- [ ] **Step 4: 实现共享部件**

`layout-parts.tsx` 复用现有 `templates.tsx` 里已验证的 `Header` / `Block` / `PeriodItem` / `LevelDots` / `RichHtml` 逻辑，改为接收 `theme` 并用钩子类名：

- `SectionBlock` 渲染 `<section class="block hdg-{theme.heading}">`，标题形态由 CSS 钩子决定
- `SkillList` 按 `theme.skill` 渲染 `dots` / `bars` / `tags` / `plain` 四种形态
- `HeaderBlock` 按 `theme.nameStyle` / `theme.avatar` 渲染姓名与头像
- `RichHtml` 保持现有清洗逻辑（去 `<script>`），**不加 emoji**

- [ ] **Step 5: 实现 7 个骨架**

每个骨架文件导出同名组件，签名统一为：

```tsx
export function SingleClassic({ data, theme }: { data: ResumeData; theme: ThemeTokens }) { … }
```

- `single-classic`：单栏，姓名居中大标题，章节标题细线分隔
- `single-modern`：单栏，姓名左对齐，章节标题左侧竖条
- `sidebar-left`：左侧固定宽 34% 侧栏（放联系方式 / 技能 / 语言 / 兴趣），右侧 66% 放简介 / 工作 / 项目 / 教育；用 CSS Grid `grid-template-columns: 34% 1fr`
- `sidebar-right`：同上但侧栏在右
- `two-column`：两栏均衡 50/50，左栏工作与项目，右栏教育与技能
- `timeline`：主栏左侧一条竖线 + 节点圆点，工作/项目按时序排列
- `card-grid`：项目经历用 2 列卡片网格，每张卡片带标题条

**章节内容分配规则**（所有骨架共享，保证信息不丢）：
- 单栏骨架：简介 → 工作 → 项目 → 教育 → 技能 → 语言 → 奖项 → 证书 → 兴趣
- 侧栏骨架：侧栏 = 联系方式 / 技能 / 语言 / 兴趣 / 证书；主栏 = 简介 / 工作 / 项目 / 教育 / 奖项
- 双栏骨架：左 = 简介 / 工作 / 项目；右 = 教育 / 技能 / 语言 / 奖项 / 证书 / 兴趣
- 时间轴骨架：简介 → 工作(时间轴) → 项目(时间轴) → 教育 → 技能 → 其他
- 卡片骨架：简介 → 工作 → 项目(卡片) → 教育 → 技能 → 其他

- [ ] **Step 6: 重写 templates.module.css**

保留 `.preview` 的 A4 尺寸契约（`width: 794px; min-height: 1123px; padding: 56px 64px`），其余全部改为 token 驱动：

```css
.preview {
  width: 794px;
  min-height: 1123px;
  padding: 56px 64px;
  background: var(--paper, #fff);
  color: var(--ink, #1f2937);
  font-family: var(--font, "Noto Sans SC", sans-serif);
  font-size: calc(10px * var(--font-scale, 1));
  line-height: var(--line-height, 1.55);
}
```

钩子类（节选，全部要实现）：

```css
/* 章节标题形态 */
.hdg-rule .blockTitle { border-bottom: 1px solid var(--border); padding-bottom: 4px; }
.hdg-band .blockTitle { background: var(--accent); color: #fff; padding: 3px 8px; display: inline-block; }
.hdg-bar  .blockTitle { border-left: 3px solid var(--accent); padding-left: 8px; border-bottom: none; }
.hdg-plain .blockTitle { color: var(--muted); font-weight: 500; letter-spacing: .08em; border-bottom: none; }
.hdg-underline .blockTitle { display: inline-block; border-bottom: 2px solid var(--accent); padding-bottom: 2px; }
.hdg-index .blockTitle { color: var(--accent); }
.hdg-serif .blockTitle { font-family: var(--font-serif, "Noto Serif SC", serif); font-size: 1.15em; letter-spacing: .04em; }
```

同时实现 `.skill-dots` / `.skill-bars` / `.skill-tags` / `.skill-plain`、`.avatar-circle` / `.avatar-square` / `.avatar-rounded`、`.name-big` / `.name-underline` / `.name-band`、以及各骨架的网格布局类。

- [ ] **Step 7: 重写 templates.tsx 为薄壳**

```tsx
"use client";
import type { ResumeData } from "@/lib/validation/resume";
import { getTemplate } from "@/lib/templates";
import { TemplateRenderer } from "./template-renderer";

export function TemplatePreview({ data, template }: { data: ResumeData; template: string }) {
  return <TemplateRenderer def={getTemplate(template)} data={data} />;
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `cd apps/web && npx vitest run src/components/editor/template-renderer.test.tsx`
Expected: PASS

- [ ] **Step 9: 人工核对存量三套**

打开 `/resumes/<id>/edit`，确认 `classic` / `modern` / `minimal` 三套的预览与改动前一致（对照 git stash 前的截图或逐项比对 CSS 变量）。不一致则调整 `registry.ts` 里这三套的 theme 值。

- [ ] **Step 10: 提交**

```bash
git add apps/web/src/components/editor
git commit -m "feat: HTML 端 7 骨架 + token 驱动渲染器"
```

---

### Task 5: 32 套专属装饰层

**Files:**
- Create: `apps/web/src/components/editor/themes.module.css`（32 个 `.tpl_<id>` 装饰块）
- Modify: `apps/web/src/components/editor/template-renderer.tsx`

**Interfaces:**
- Consumes: `TemplateDef.id`、Task 4 的钩子类与 CSS 变量
- Produces: `themes.module.css` 导出 32 个 `.tpl_<id>` 类；renderer 按 `def.id` 查表挂到根 className

> 装饰层放**同一个** CSS Module 而不是 32 个独立文件：CSS Modules 的动态 key 查找需要类名在同一模块内可枚举，
> 且与仓库既有 `.tpl_classic` / `.tpl_modern` / `.tpl_minimal` 模式一致，避免 32 次静态 import。

- [ ] **Step 1: 建立装饰层机制**

`apps/web/src/components/editor/themes.module.css` 中为每个模板 id 写一个 `.tpl_<id>` 块。简单些的：

```css
/* 纯白极简 —— 零装饰,仅微调留白节奏 */
.tpl_pure-minimal {
  --block-gap: 18px;
}
```

复杂些的（如 `creative-bold`）：

```css
/* 撞色张扬 —— 大色块标题 + 玫红强调 */
.tpl_creative-bold {
  --accent-soft: #ffe4e6;
  --head-extra: 2px;
}
.tpl_creative-bold .blockTitle {
  letter-spacing: .04em;
}
```

- [ ] **Step 2: 挂载装饰层**

`template-renderer.tsx` 中静态引入该模块，并按 id 查表：

```tsx
import themes from "./themes.module.css";

const themeClass = (themes as Record<string, string>)[`tpl_${def.id}`] ?? "";
```

把 `themeClass` 拼到根元素 className 上（与 `styles.preview` 并列）。

- [ ] **Step 3: 逐套填充并自检**

按设计文档第 3 节表格逐套填写 `.tpl_<id>`。每套至少做到「与其余 31 套在骨架 / 主色 / 字体 / 标题形态 / 装饰中有一项显著不同」。`pure-minimal` 与 `minimal` 必须靠分节间距与正文缩进拉开（见设计文档去重约束）。

- [ ] **Step 4: 视觉走查**

打开 `/templates`（Task 7 完成后）逐套目视检查 32 套缩略图，确认无两套看起来雷同。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/editor/themes.module.css apps/web/src/components/editor/template-renderer.tsx
git commit -m "feat: 32 套模板专属装饰层"
```

---

### Task 6: PDF 渲染器（7 骨架 react-pdf 实现）

**Files:**
- Create: `apps/web/src/lib/pdf/theme-styles.ts`
- Create: `apps/web/src/lib/pdf/layouts/single-classic.tsx`
- Create: `apps/web/src/lib/pdf/layouts/single-modern.tsx`
- Create: `apps/web/src/lib/pdf/layouts/sidebar-left.tsx`
- Create: `apps/web/src/lib/pdf/layouts/sidebar-right.tsx`
- Create: `apps/web/src/lib/pdf/layouts/two-column.tsx`
- Create: `apps/web/src/lib/pdf/layouts/timeline.tsx`
- Create: `apps/web/src/lib/pdf/layouts/card-grid.tsx`
- Modify: `apps/web/src/lib/pdf/documents.tsx`
- Test: `apps/web/src/lib/pdf/documents.test.ts`

**Interfaces:**
- Consumes: `TemplateDef`、`ThemeTokens`、`getFontFamily(key)`、`registerFontsOnce()`
- Produces: `documents.tsx` 导出 `ResumeDocument({ data, template }: { data: ResumeData; template: string })`（`template` 放宽为 string，内部查注册表）

- [ ] **Step 1: 扩写失败测试**

在 `apps/web/src/lib/pdf/documents.test.ts` 增加：

```ts
it("全部模板都能生成可解析的 PDF", async () => {
  await registerFontsOnce();
  for (const def of TEMPLATES) {
    const buf = await generate(SAMPLE_PROFESSIONAL, def.id);
    expect(buf.length, def.id).toBeGreaterThan(1000);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount(), def.id).toBeGreaterThanOrEqual(1);
  }
});
```

并新增：解码首页文本，断言包含范文中的中文姓名；断言不出现 `.notdef`（沿用既有 emoji 乱码检测写法）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/lib/pdf/documents.test.ts`
Expected: FAIL —— `generate` 的 template 参数类型不接受 32 个 id 中的多数

- [ ] **Step 3: 实现 theme-styles.ts**

```ts
import { StyleSheet } from "@react-pdf/renderer";
import type { ThemeTokens } from "@/lib/templates/types";
import { getFontFamily } from "./font";

export function buildThemeStyles(theme: ThemeTokens) {
  const fontFamily = getFontFamily(theme.font);
  const fs = theme.fontScale;
  return StyleSheet.create({
    page: {
      fontFamily,
      fontSize: 10 * fs,
      lineHeight: 1.4 * theme.lineHeight,
      color: theme.ink,
      paddingTop: 40, paddingBottom: 40, paddingLeft: 56, paddingRight: 56,
    },
    name: { fontSize: 22 * fs, fontWeight: 700, marginBottom: 2 },
    label: { fontSize: 10 * fs, color: theme.muted, marginBottom: 4 },
    contact: { fontSize: 9 * fs, color: theme.muted, flexDirection: "row", flexWrap: "wrap" },
    blockTitle: { fontSize: 12 * fs, fontWeight: 700, marginBottom: 6, color: theme.ink },
    muted: { color: theme.muted },
    accent: { color: theme.accent },
    rich: { fontSize: 9.5 * fs },
    richLine: { marginBottom: 1 },
    richList: { marginLeft: 12, marginBottom: 2 },
    itemTitle: { fontWeight: 700 },
    itemSubtitle: { color: theme.muted },
    itemRange: { color: theme.muted, fontSize: 9 * fs },
  });
}
```

- [ ] **Step 4: 实现 7 个 PDF 骨架**

每个骨架导出：

```tsx
export function PdfSidebarLeft({ data, theme }: { data: ResumeData; theme: ThemeTokens }) { … }
```

- 分栏写法（react-pdf 无 flex 百分比栅格，用固定宽度）：

```tsx
const s = buildThemeStyles(theme);
<View style={{ flexDirection: "row" }}>
  <View style={{ width: 34 * 5.83, paddingRight: 14 }}>{sidebar}</View>
  <View style={{ width: 66 * 5.83 }}>{main}</View>
</View>
```

（5.83 ≈ A4 可用宽度 483pt ÷ 83%）

- 标题形态钩子在 PDF 端降级映射：`rule` → `borderBottomWidth`；`bar` → `borderLeftWidth`；`band` → `backgroundColor` + `color: #fff` + padding；`underline` → `borderBottomWidth: 1.5`；`index` → 标题前加序号文本；`plain` / `serif` → 仅字号/字体差异
- 技能形态：dots 用 `●`/`○`（已有实现）；bars 用一串 `▇`/`▁`；tags 用 `[名称]` 文本；plain 用纯文本
- 保留现有 `RichHtml` 解析器（`splitTopLevel` / `parseFrag` / `decodeEntities`），不引入新依赖
- **禁止 emoji**

- [ ] **Step 5: 改造 documents.tsx**

```tsx
export function ResumeDocument({ data, template }: { data: ResumeData; template: string }) {
  const def = getTemplate(template);
  switch (def.layout) {
    case "single-modern": return <PdfSingleModern data={data} theme={def.theme} />;
    case "sidebar-left": return <PdfSidebarLeft data={data} theme={def.theme} />;
    case "sidebar-right": return <PdfSidebarRight data={data} theme={def.theme} />;
    case "two-column": return <PdfTwoColumn data={data} theme={def.theme} />;
    case "timeline": return <PdfTimeline data={data} theme={def.theme} />;
    case "card-grid": return <PdfCardGrid data={data} theme={def.theme} />;
    case "single-classic":
    default: return <PdfSingleClassic data={data} theme={def.theme} />;
  }
}
```

同时把 `RichHtml` 抽到 `src/lib/pdf/rich-html.tsx` 供骨架复用（避免 7 份重复）。

- [ ] **Step 6: 运行测试确认通过**

Run: `cd apps/web && npx vitest run src/lib/pdf/documents.test.ts`
Expected: PASS（32 套全部生成成功）

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/lib/pdf
git commit -m "feat: PDF 端 7 骨架 + token 驱动渲染器"
```

---

### Task 7: 模板库画廊页 `/templates`

**Files:**
- Create: `apps/web/src/app/templates/page.tsx`
- Create: `apps/web/src/app/templates/page.module.css`
- Create: `apps/web/src/app/templates/gallery-client.tsx`
- Create: `apps/web/src/components/templates/template-picker.tsx`
- Create: `apps/web/src/components/templates/template-picker.module.css`
- Create: `apps/web/src/components/templates/template-thumb.tsx`
- Create: `apps/web/src/components/templates/use-in-view.ts`
- Test: `apps/web/src/app/templates/gallery-client.test.tsx`

**Interfaces:**
- Consumes: `TEMPLATES`、`STYLE_GROUPS`、`SCENE_TAGS`、`ROLE_TAGS`、`TemplateRenderer`
- Produces:
  - `components/templates/template-picker.tsx` 导出 `TemplatePicker({ mode, onSelect, onClose })`，`mode: "create" | "switch"`
  - `components/templates/template-thumb.tsx` 导出 `TemplateThumb({ def, width })`

- [ ] **Step 1: 写失败测试**

`apps/web/src/app/templates/gallery-client.test.tsx`：

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GalleryClient } from "./gallery-client";
import { TEMPLATES } from "@/lib/templates";

describe("GalleryClient", () => {
  it("渲染全部模板卡片", () => {
    const html = renderToStaticMarkup(<GalleryClient />);
    for (const t of TEMPLATES) {
      expect(html, t.id).toContain(t.name);
    }
  });

  it("渲染风格组 Tab", () => {
    const html = renderToStaticMarkup(<GalleryClient />);
    expect(html).toContain("极简黑白");
    expect(html).toContain("学术稳重");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/app/templates/gallery-client.test.tsx`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: 实现画廊页**

`page.tsx` 为 Server Component，做 `export const dynamic = "force-dynamic"`（与 `/resumes` 一致），渲染标题 + `<GalleryClient />`。

`gallery-client.tsx` 为 Client Component：

- state：`query`、`group`、`scenes: SceneTag[]`、`roles: RoleTag[]`
- 过滤逻辑：先按 `query` 匹配 `name`/`summary`，再按 `group`，再按 `scenes`（与选中的场景有交集）、再按 `roles`（有交集）
- 网格：`display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px`
- 卡片：缩略图 + 名称 + 风格组徽章 + 标签 + 「使用此模板」按钮
- 选中行为分两种 mode：
  - `create`：调 `POST /api/resumes`（body `{ title: "未命名简历", template: id, data: def.sample }`），成功后 `router.push("/resumes/" + created.id + "/edit")`
  - `switch`：调 `onSelect(id)` 由外部（编辑器）处理

- [ ] **Step 4: 实现懒加载缩略图**

`use-in-view.ts`：基于 `IntersectionObserver` 的 `useInView<T extends HTMLElement>()` hook。

`template-thumb.tsx`：

```tsx
export function TemplateThumb({ def, width = 220 }: { def: TemplateDef; width?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const scale = width / 794;
  return (
    <div ref={ref} className={styles.frame} style={{ width, height: 1123 * scale }}>
      {inView ? (
        <div className={styles.scaler} style={{ transform: `scale(${scale})` }}>
          <TemplateRenderer def={def} data={def.sample} />
        </div>
      ) : (
        <div className={styles.placeholder} />
      )}
    </div>
  );
}
```

`styles.frame` 用 `overflow: hidden`，`styles.scaler` 用 `transform-origin: top left` + `width: 794px`。

- [ ] **Step 5: 实现 TemplatePicker**

弹层容器（`position: fixed` 遮罩 + 居中面板），内含筛选条 + 网格；`mode="create"` 时按钮文案「使用此模板」，`mode="switch"` 时为「切换到此模板」。

- [ ] **Step 6: 运行测试确认通过**

Run: `cd apps/web && npx vitest run src/app/templates/gallery-client.test.tsx`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/app/templates apps/web/src/components/templates
git commit -m "feat: 模板库画廊页与模板选择器"
```

---

### Task 8: 创建流程、换模板、API 校验与列表页徽章

**Files:**
- Modify: `apps/web/src/app/api/resumes/route.ts`
- Modify: `apps/web/src/lib/resume-repo.ts`
- Modify: `apps/web/src/app/resumes/ResumesClient.tsx`
- Modify: `apps/web/src/components/editor/editor-shell.tsx`
- Modify: `apps/web/src/components/editor/use-local-draft.ts`
- Modify: `apps/web/src/app/resumes/page.module.css`
- Test: `apps/web/src/app/api/resumes/route.test.ts`（若已存在则扩写）

**Interfaces:**
- Consumes: `isTemplateId(id)`、`getTemplate(id)`、`TemplatePicker`
- Produces: `POST /api/resumes` 接受注册表内任意 template id，并可选 `data` 字段作为初始内容

- [ ] **Step 1: 写失败测试**

在 API 测试中加：

```ts
it("接受注册表内的模板 id", async () => {
  const res = await POST(new Request("http://x/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "t", template: "timeline-style" }),
  }));
  expect(res.status).toBe(201);
});

it("拒绝注册表外的模板 id", async () => {
  const res = await POST(new Request("http://x/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "t", template: "no-such-template" }),
  }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npx vitest run src/app/api/resumes/route.test.ts`
Expected: FAIL —— `z.enum` 只接受三个 id

- [ ] **Step 3: 改造 API 校验**

`apps/web/src/app/api/resumes/route.ts`：

```ts
import { isTemplateId, getTemplate } from "@/lib/templates";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.string().optional(),
  data: z.unknown().optional(),
});

// 校验时:
const template = parsed.template ?? "classic";
if (!isTemplateId(template)) {
  return NextResponse.json({ error: `未知模板: ${template}` }, { status: 400 });
}
```

创建时若 `data` 存在且能通过 `ResumeDataSchema`，则用 `repairResumeData` 归一化后作为初始内容。

- [ ] **Step 4: 改造 resume-repo**

`CreateResumeInput.template` 类型由字面量联合改为 `string`；`createResume` 保持透传。

- [ ] **Step 5: 列表页徽章与入口**

`ResumesClient.tsx`：

- `TPL_LABEL` 改为 `getTemplate(tpl).name`
- 「新建简历」旁新增「从模板新建」按钮 → `router.push("/templates")`
- 卡片徽章用注册表名称

- [ ] **Step 6: 编辑器换模板**

`editor-shell.tsx`：

- 删除本地 `TEMPLATES` 数组与 `asTemplateId`，改为 `getTemplate(draft.template)`
- 顶部模板按钮组换成单个「模板」按钮，点击打开 `<TemplatePicker mode="switch" onSelect={(id) => draft.setTemplate(id)} />`
- 预览改为 `<TemplateRenderer def={getTemplate(draft.template)} data={draft.data} />`

`use-local-draft.ts`：`template` state 类型由三选一改为 `string`，初值 `getTemplate(initialTemplate).id`（未知 id 兜底 classic）。

- [ ] **Step 7: 运行测试**

Run: `cd apps/web && npx vitest run src/app/api/resumes src/components/editor src/lib`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/app/api/resumes apps/web/src/lib/resume-repo.ts apps/web/src/app/resumes apps/web/src/components/editor
git commit -m "feat: 模板库接入创建流程与编辑器换模板"
```

---

### Task 9: 全量回归与验收

**Files:**
- Modify: `apps/web/src/lib/pdf/documents.test.ts`（补齐断言）
- Create: `apps/web/e2e/templates.spec.ts`（若 Playwright 配置存在 e2e 目录）

**Interfaces:**
- Consumes: 全部前序任务产物
- Produces: 验收证据

- [ ] **Step 1: 跑类型检查**

Run: `cd apps/web && npm run typecheck`
Expected: 0 error

- [ ] **Step 2: 跑全量单测**

Run: `cd apps/web && npm test`
Expected: 全部 PASS（既有 229 个用例不得回归）

- [ ] **Step 3: 跑生产构建**

Run: `cd apps/web && npm run build`
Expected: exit 0

- [ ] **Step 4: 起 dev server 验证页面**

Run（若未在跑）:
```powershell
cd D:\code\coding\dl-resume\apps\web
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $PWD `
  -RedirectStandardOutput 'D:\code\coding\dl-resume\dev-server.log' `
  -RedirectStandardError  'D:\code\coding\dl-resume\dev-server.err.log' -PassThru -NoNewWindow
```

Run:
```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email='admin@example.com'; password='changeme-on-first-login' } | ConvertTo-Json
Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/login' -Method POST -Body $body -ContentType 'application/json' -WebSession $s -UseBasicParsing
Invoke-WebRequest -Uri 'http://localhost:3000/templates' -WebSession $s -UseBasicParsing
Invoke-WebRequest -Uri 'http://localhost:3000/resumes' -WebSession $s -UseBasicParsing
```
Expected: 均 200

- [ ] **Step 5: 逐套导出 PDF 验证**

写一次性脚本 `apps/web/scripts/_verify-templates.mts`，对 32 套模板各生成一份 PDF 到临时目录并打印文件大小；确认无异常、无 0 字节文件。验证后删除该脚本。

- [ ] **Step 6: e2e（可选，跑不通不阻塞交付但要记录）**

`apps/web/e2e/templates.spec.ts`：打开 `/templates` → 按风格组筛选 → 选中第一套 → 应跳到编辑器且姓名是范文姓名。

- [ ] **Step 7: 最终提交**

```bash
git add apps/web/src apps/web/e2e
git commit -m "test: 模板库全量回归与 32 套 PDF 导出验证"
```

---

### Task 10: 扩展批次 —— 再加 50 套（合计 82 套）

**背景：** 首批 32 套把 7 个骨架都用上了，但单栏占 17 套、时间轴 / 右侧栏 / 项目卡片各只有 1～2 套，模板库整体偏同质。用户要求"再多设置 50 个模板，不能和之前设计的重复"。

**核心手段：先扩 token 维度，再填数据。** 模板的视觉差异 = 骨架 + token 维度组合 + 专属装饰。只堆数据而不扩维度，50 套很快就会用尽组合空间。

**Step 1: 扩两个高杠杆 token 维度（HTML + PDF 双端）**

- `ThemeTokens.headerStyle`：`auto` / `inline` / `center` / `stack` / `boxed` / `band`
  - HTML：`components/editor/layouts/parts.tsx` 的 `HeaderBlock` 按 `theme.headerStyle` 分派；CSS 新增 `.hd_auto` / `.hd_inline` / `.hd_center` / `.hd_stack` / `.hd_boxed` / `.hd_band`
  - PDF：`lib/pdf/theme-styles.ts` 新增 `headerStack` / `headerBoxed` / `headerBand` / `bandName` / `bandLabel` / `bandContact` / `bandOneLine`；`lib/pdf/layouts/parts.tsx` 的 `HeaderBlock` 同样分派
  - **`auto` = 沿用骨架默认**（单栏经典居中、其余左对齐），存量 32 套全部保持 `auto` → 外观零变化
- 标题形态 `+bracket`（【标题】）/ `+solid`（墨色实心块）/ `+outline`（描边框）
- 姓名形态 `+frame`（描边框）/ `+bracket`（【姓名】）
- 头像形态 `+ring`（双环）
  - 这三组 HTML / PDF 都有实现 → 双端同步生效
  - PDF 端**禁止 letterSpacing**（v4 会拆散文本层），因此没有采用字距型标题形态

**Step 2: 写 50 套注册数据（`lib/templates/registry.ts`）**

九个维度全部错开：骨架 / 主色 / 字体 / 抬头 / 标题 / 技能 / 姓名 / 头像 / 专属装饰。50 个主色互不相同，且与首批 32 套主色集合无交集。

**Step 3: 写 50 段专属装饰层（`components/editor/templates.module.css`）**

每套只给一个明确手法（细线 / 点阵 / 双竖条 / 印章 / 网格 / 折线 / 波浪 / 装订线 / 刻度 …）。**注意 CSS Modules 的纯选择器约束**：根元素装饰必须写成 `[data-tpl="<id>"].preview`，裸的 `[data-tpl="<id>"]`（含 `::after`）会报 `Selector is not pure` 并让整页 CSS 编译失败。

**Step 4: 把"不重复"变成可执行断言（`registry.test.ts`）**

- 首批 32 套之后追加的批次：主色互不重复、且不复用首批主色
- 六元组（骨架 + 主色 + 字体 + 抬头 + 标题 + 姓名）全局唯一
- 中文名唯一
- 7 个骨架全覆盖，且任一骨架占比 < 35%
- 维度覆盖：字体 3 / 标题 10 / 技能 4 / 头像 5 / 姓名 6 / 抬头 6 / 风格组 8 必须全部用到

**Step 5: 装饰层静态校验（`components/editor/templates-css.test.ts`，新增）**

跨 CSS Module 引用不到对方的哈希类名，拼错类名不会报错、只会静默失效 —— 这个测试静态解析 CSS，断言：每套模板都有 `[data-tpl]` 装饰块、装饰里引用的类名都在骨架里定义过、没有孤儿 id。

**Step 6: 回归**

- `npm run typecheck` → 0 error
- `npx vitest run` → 25 files / 286 tests passed（含"全部模板都能生成可解析的 PDF"82 套）
- `npm run build` → exit 0
- 浏览器走查：编辑器内逐套切换 82 套模板并截图，**MD5 比对证明 82 张预览两两像素不同**

**验收：** 见设计文档 §10 第 9 条。

---


## 附录：82 套模板的骨架与 token 速查

实施时以设计文档第 3 节表格为唯一真源，此处仅供快速查阅骨架分布（首批 32 套 + 扩展 50 套）：

| 骨架 | 模板 id |
|---|---|
| 单栏经典 | pure-minimal, classic, gold-luxury, cream, elegant-serif, pearl, academic, paper-serif, ivory-line, hairline-frame, burgundy, midnight-navy, pixel-block, sea-salt, rose-pearl, jade-seal, ivory-gilt, ats-pure, ledger-line, scholar-indigo, citation-num |
| 单栏现代 | mono-line, ink-brush, gray-underline, modern, tech-gradient, fresh-mint, champagne, minimal, compact, dot-matrix, mist-box, indigo-double, violet-orbit, matcha-vert, champagne-line, marker-scribble, onepage-draft, checklist, thesis-tight, course-card |
| 双栏均衡 | mono-grid, blue-corporate, code-style, sky-blue, creative-bold, two-col-pro, lab-report, graphite-band, slate-pro, bronze-plaque, matrix-term, latte-cream, obsidian, platinum-dot, mocha-frame, split-neon, table-grid, blueprint-grid, review-margin |
| 左侧栏 | navy-elegant, dark-tech, sakura, infographic, pine-ink, indigo-night, lavender-veil, lab-axis |
| 右侧栏 | luxury-dark, steel-edge, cold-steel, dossier-file |
| 时间轴 | timeline-style, willow-slash, zigzag-div |
| 项目卡片 | designer, magazine, neon-ring, holo-card, peach-jelly, sticker-pop, comic-panel |

