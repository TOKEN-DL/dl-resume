# 简历模板库设计文档（32 套模板）

- 日期：2026-10-22
- 项目：dl-resume（简册）—— Next.js 15 App Router 简历系统
- 状态：设计已确认（用户逐节确认 + 批准执行）

---

## 1. 背景与目标

当前系统只有 3 套模板（`classic` / `modern` / `minimal`），散落在 6 处硬编码字面量里。用户创建简历时只能选这三个，无法按岗位、场景、风格挑选版式。

本次目标：

1. 新增**模板库模块**：用户可从模板库选择模板创建简历。
2. 提供**至少 30 套视觉上明显不同**的简历模板，参考老鱼简历（laoyujianli.com）的模板组织思路（场景 / 岗位 / 风格三维）。
3. 每套模板**自带范文**，画廊用范文真实渲染缩略图。
4. HTML 预览与 PDF 导出**双端对齐**，32 套全部覆盖。

参考站调研结论：老鱼简历是 umi SPA，`web_fetch` 只能拿到空壳 HTML，模板清单无法直接抓取；其分类维度通过 web_search 确认。**本方案不复制其视觉稿，只借鉴其「按场景/岗位/风格组织模板」的产品思路，视觉全部自行设计。**

### 1.1 已确认的需求决策

| 决策点 | 结论 |
|---|---|
| 首要目标 | 视觉多样优先：模板库本身是产品卖点，套与套之间肉眼明显不同 |
| PDF 覆盖 | 32 套全部有 PDF，且尽量与预览一致 |
| 字体 | 引入 3 款开源中文字体；预览走 @fontsource / webfont，PDF 走对应 OTF/TTF；同时修复 Docker 字体管线 |
| 示例内容 | 每套自带范文；画廊用范文渲染缩略图；选中后范文预填新简历 |
| 入口形态 | 独立 `/templates` 画廊页（分类筛选 + 缩略图网格），列表页与编辑器都指向它 |
| 分类体系 | 风格为主轴（Tab）+ 场景/岗位为标签，筛选可叠加 |
| 存量模板 | `classic` / `modern` / `minimal` 保留 id 与现有外观，重新纳入模板库 |
| 缩略图 | 真实渲染（范文 + 真实模板组件），缩放显示 + 滚动懒加载 |
| 实现架构 | 方案 C：7 个布局骨架 + 每套专属设计层（token 驱动双端） |

---

## 2. 架构：模板即数据，渲染器即代码

### 2.1 两层拆分

- **骨架（结构）**：`single-classic` 单栏经典 / `single-modern` 单栏现代 / `sidebar-left` 左侧栏 / `sidebar-right` 右侧栏 / `two-column` 双栏均衡 / `timeline` 时间轴 / `card-grid` 项目卡片流，共 7 个。
- **主题（视觉）**：纯数据 token，描述颜色、字体族、字号阶梯、行距、圆角、标题形态、技能展示形态、头像形状、姓名样式。

每套模板 = 一个骨架 + 一份主题 token + 一份专属装饰层 + 一份范文。

### 2.2 类型定义

`apps/web/src/lib/templates/types.ts`：

```ts
// TemplateId 是从注册表派生的字面量联合，不是手写的 string
// registry.ts: export const TEMPLATE_IDS = ["pure-minimal", …] as const;
// types.ts:     export type TemplateId = (typeof TEMPLATE_IDS)[number];
export type FontKey = "sans" | "serif" | "kai";
export type LayoutKind =
  | "single-classic" | "single-modern"
  | "sidebar-left"   | "sidebar-right"
  | "two-column"     | "timeline" | "card-grid";

export type StyleGroup =
  | "minimal"   // 极简黑白
  | "business"  // 商务经典
  | "modern"    // 现代科技
  | "fresh"     // 清新雅致
  | "elegant"   // 优雅高级
  | "creative"  // 创意个性
  | "functional"// 简洁实用
  | "academic";  // 学术稳重

export type SceneTag = "campus" | "social" | "intern" | "student" | "general";
export type RoleTag =
  | "frontend" | "backend" | "product" | "operation"
  | "design" | "algorithm" | "data" | "qa" | "research" | "finance";

export interface ThemeTokens {
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  border: string;
  paper: string;
  font: FontKey;
  fontScale: number;      // 0.9 ~ 1.1
  lineHeight: number;
  radius: number;
  heading: "rule" | "band" | "bar" | "plain" | "underline" | "index" | "serif";
  skill:  "dots" | "bars" | "tags" | "plain";
  avatar: "circle" | "square" | "rounded" | "none";
  nameStyle: "plain" | "underline" | "band" | "big";
}

export interface TemplateDef {
  id: TemplateId;
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

### 2.3 双端一致性机制（核心）

**主题 token 是纯数据，HTML 端注入为 CSS 变量，PDF 端喂给 `StyleSheet.create`。**

| 差异类型 | 单一来源 | 漂移可能性 |
|---|---|---|
| 颜色 / 字号 / 间距 | 同一份 `ThemeTokens` | 结构上不可能漂移 |
| 信息结构 / 章节顺序 | 同一份骨架（HTML 与 PDF 一一对应实现） | 由骨架级回归测试兜底 |
| 装饰细节 | 每套模板的专属装饰层 | PDF 端做等效简化（见 2.4） |

`apps/web/src/lib/pdf/documents.tsx` 现有的 `Block({ variant: "classic" | "modern" | "minimal" })` 硬编码三选一是漂移源头，重构后 `variant` 由 token 派生。

### 2.4 装饰层双端规则

- 影响信息结构 / 阅读顺序的装饰 → **必须双端都有**
- 纯视觉装饰（花纹、水印、角标）→ 预览端可以有，PDF 端允许省略
- 双端都有的装饰 → 用 border / background / 色块 / 分割线做等效实现

### 2.5 目录结构

```
apps/web/src/
  lib/templates/
    types.ts          — 类型定义
    registry.ts       — TEMPLATES: TemplateDef[]（32 条）、getTemplate(id)、isTemplateId()、TEMPLATE_IDS
    samples.ts        — 3 份基线范文 + 每套模板的 sample 引用与微调
    fonts.ts          — FontKey → { html: string; pdf: string } 映射
    index.ts          — 对外导出
  components/editor/
    template-renderer.tsx            — HTML 渲染入口，按 layout 分发
    layouts/*.tsx                    — 7 个骨架的 HTML 实现
    templates.module.css              — 骨架结构 + 钩子变体类（.hdg-rule / .hdg-band / …）
    themes/<template-id>.module.css  — 每套模板的专属装饰层（≤30 行/套）
  lib/pdf/
    documents.tsx       — <TemplateDocument def data>，按 layout 分发
    layouts/*.tsx       — 7 个骨架的 react-pdf 实现
    theme-styles.ts     — ThemeTokens → StyleSheet（双端唯一真源）
  app/templates/        — 画廊页（新建路由）
    page.tsx / page.module.css
```

---

## 3. 32 套模板清单

字体：黑 = Noto Sans SC，宋 = Noto Serif SC，楷 = LXGW WenKai。

标签列使用合法枚举值：场景 = 通用/校招/社招/实习/大学生，岗位 = 前端/后端/产品/运营/设计/算法/数据/测试/科研/金融。

| # | id | 名称 | 风格组 | 骨架 | 字体 | 主色 | 标题/技能 | 标签（场景 + 岗位） |
|---|---|---|---|---|---|---|---|---|
| 1 | `pure-minimal` | 纯白极简 | 极简黑白 | 单栏经典 | 黑 | `#111111` | 无框/纯文本 | 通用 |
| 2 | `mono-line` | 黑白线框 | 极简黑白 | 单栏现代 | 黑 | `#111111` | 细线/圆点 | 通用、校招 |
| 3 | `ink-brush` | 墨色留白 | 极简黑白 | 单栏现代 | 宋 | `#1a1a1a` | 下划线/纯文本 | 通用 |
| 4 | `mono-grid` | 灰度网格 | 极简黑白 | 双栏均衡 | 黑 | `#525252` | 竖条/标签 | 通用、后端 |
| 5 | `classic` ⭐ | 经典商务 | 商务经典 | 单栏经典 | 宋 | `#0f172a` | 细线/圆点 | 通用、社招 |
| 6 | `blue-corporate` | 蓝调商务 | 商务经典 | 双栏均衡 | 黑 | `#1e40af` | 下划线/圆点 | 社招、通用 |
| 7 | `navy-elegant` | 深蓝典雅 | 商务经典 | 左侧栏 | 宋 | `#1e3a5f` | 衬线/分级条 | 社招、产品、运营 |
| 8 | `gold-luxury` | 香槟金 | 商务经典 | 单栏经典 | 宋 | `#8a6d3b` | 下划线/纯文本 | 社招、金融、设计 |
| 9 | `gray-underline` | 灰度横线 | 商务经典 | 单栏现代 | 黑 | `#374151` | 下划线/分级条 | 通用、后端 |
| 10 | `modern` ⭐ | 现代蓝 | 现代科技 | 单栏现代 | 黑 | `#2563eb` | 竖条/圆点 | 通用、前端 |
| 11 | `tech-gradient` | 科技渐变 | 现代科技 | 单栏现代 | 黑 | `#0ea5e9` | 色块/标签 | 前端、算法、大学生 |
| 12 | `dark-tech` | 深空科技 | 现代科技 | 左侧栏 | 黑 | `#22d3ee` | 无框/分级条 | 前端、算法、数据 |
| 13 | `code-style` | 代码极客 | 现代科技 | 双栏均衡 | 黑 | `#16a34a` | 序号/标签 | 后端、算法、前端 |
| 14 | `fresh-mint` | 薄荷清新 | 清新雅致 | 单栏现代 | 黑 | `#10b981` | 细线/圆点 | 实习、校招、运营 |
| 15 | `sakura` | 樱粉 | 清新雅致 | 左侧栏 | 黑 | `#db2777` | 色块/标签 | 实习、大学生、运营 |
| 16 | `cream` | 米色治愈 | 清新雅致 | 单栏经典 | 楷 | `#b08968` | 无框/纯文本 | 设计、大学生 |
| 17 | `sky-blue` | 天青 | 清新雅致 | 双栏均衡 | 楷 | `#0d8ba1` | 衬线/分级条 | 大学生、校招、设计 |
| 18 | `elegant-serif` | 雅致宋体 | 优雅高级 | 单栏经典 | 宋 | `#1f2937` | 衬线/纯文本 | 通用、社招、科研 |
| 19 | `champagne` | 香槟极简 | 优雅高级 | 单栏现代 | 宋 | `#a8a29e` | 无框/纯文本 | 通用、设计 |
| 20 | `luxury-dark` | 墨黑鎏金 | 优雅高级 | 右侧栏 | 宋 | `#c9a227` | 衬线/纯文本 | 社招、金融 |
| 21 | `pearl` | 珍珠白 | 优雅高级 | 单栏经典 | 楷 | `#78716c` | 下划线/圆点 | 通用、大学生 |
| 22 | `creative-bold` | 撞色张扬 | 创意个性 | 双栏均衡 | 黑 | `#f43f5e` | 色块/标签 | 运营、设计 |
| 23 | `designer` | 设计师作品集 | 创意个性 | 项目卡片 | 黑 | `#7c3aed` | 序号/标签 | 设计、产品 |
| 24 | `timeline-style` | 时间轴叙事 | 创意个性 | 时间轴 | 黑 | `#0f766e` | 无框/圆点 | 产品、运营、大学生 |
| 25 | `magazine` | 杂志编排 | 创意个性 | 项目卡片 | 宋 | `#111111` | 衬线/纯文本 | 设计 |
| 26 | `minimal` ⭐ | 极简灰 | 极简黑白 | 单栏现代 | 黑 | `#4b5563` | 无框/纯文本 | 通用 |
| 27 | `compact` | 紧凑一页 | 简洁实用 | 单栏现代 | 黑 | `#374151` | 细线/标签 | 社招、后端、测试 |
| 28 | `two-col-pro` | 双栏专业 | 简洁实用 | 双栏均衡 | 黑 | `#1f2937` | 竖条/分级条 | 通用、后端、数据 |
| 29 | `infographic` | 图示信息 | 简洁实用 | 左侧栏 | 黑 | `#0891b2` | 序号/分级条 | 产品、数据、运营 |
| 30 | `academic` | 学术蓝 | 学术稳重 | 单栏经典 | 宋 | `#1e40af` | 下划线/纯文本 | 科研、大学生 |
| 31 | `paper-serif` | 论文感 | 学术稳重 | 单栏经典 | 宋 | `#374151` | 细线/纯文本 | 科研 |
| 32 | `lab-report` | 实验报告 | 学术稳重 | 双栏均衡 | 黑 | `#475569` | 竖条/圆点 | 科研、数据 |

⭐ = 存量模板（`classic` / `modern` / `minimal`），保留 id 与现有外观。

骨架分布：单栏现代 9、单栏经典 10、双栏均衡 5、左侧栏 5、右侧栏 1、时间轴 1、项目卡片 2。

**去重约束（实现时必须满足）**：任意两套模板的「骨架 + 主色 + 字体 + 标题形态」四元组不得相同。`pure-minimal` 与 `minimal` 距离最近，实现时通过分节间距与正文缩进再拉开一档。

---

## 4. 画廊页 `/templates`

### 4.1 页面结构

- 顶部：标题 + 搜索框（按模板名模糊匹配）
- 筛选区：
  - 风格主轴：8 个 Tab（全部 / 极简黑白 / 商务经典 / 现代科技 / 清新雅致 / 优雅高级 / 创意个性 / 简洁实用 / 学术稳重）
  - 场景标签：多选胶囊（通用 / 校招 / 社招 / 实习 / 大学生）
  - 岗位标签：多选胶囊（前端 / 后端 / 产品 / 运营 / 设计 / 算法 / 数据 / 测试 / 科研 / 金融）
  - 三个维度之间 AND 叠加，同维度内 OR
- 主体：缩略图网格（响应式，3–4 列），每张卡片 = 真实渲染的模板缩略图 + 模板名 + 风格组徽章 + 「使用此模板」按钮
- 右上角固定「返回」按钮

### 4.2 缩略图实现

- 用**范文数据 + 真实模板组件**渲染完整 A4（794×1123px），外层 `transform: scale()` 缩到卡片宽度（约 0.28–0.36），卡片用 `overflow: hidden` + 固定宽高比裁切
- `IntersectionObserver` 懒加载：进入视口才渲染 DOM，避免首屏 32 份 A4 造成卡顿
- 首屏先出等高占位骨架，保证网格不跳动
- 缩略图区域禁用指针事件，避免误触滚动

### 4.3 模板选择器组件复用

画廊的核心「卡片 + 缩略图 + 选择动作」抽成 `<TemplatePicker>`，供两种场景复用：

| 场景 | 容器 | 行为 |
|---|---|---|
| 新建简历 | `/templates` 整页 | 选中 → 创建简历 → 跳转编辑器 |
| 编辑器内换模板 | 编辑器内弹层（宽幅抽屉 / 大模态） | 选中 → 立即切换预览 → 自动保存 template 字段 |

---

## 5. 创建与换模板流程

### 5.1 新建

1. `/resumes` 列表页现有「新建简历」按钮旁增加 **「从模板新建」** → 跳 `/templates`
2. `/templates` 选中模板 → `POST /api/resumes`，body：`{ title, template: <id>, data: <模板范文> }`
3. 服务端创建后跳 `/resumes/<id>/edit`，编辑器直接显示范文内容，用户在此基础上改

`POST /api/resumes` 的 template 校验从 `z.enum([...])` 改为基于注册表的动态校验：不在注册表里的 id 一律 400，错误信息列出合法 id。

### 5.2 编辑器内换模板

- 顶部工具栏原来的 3 个模板按钮 → 单个 **「模板」** 按钮，打开 `<TemplatePicker>` 弹层
- 弹层内选中模板 → `draft.setTemplate(id)` → 右侧预览立即重渲染 → 走既有 `useLocalDraft` 自动保存链路（PATCH `template` 字段）
- 切换模板**不改变简历内容**（与现在行为一致），只换呈现

### 5.3 数据与持久化

- `prisma/schema.prisma` 中 `Resume.template` 已是 `String @default("classic")` → **无需数据库迁移**
- `src/lib/resume-repo.ts` 的 `CreateResumeInput.template` 类型由字面量联合改为 `string` + 注册表校验
- 未知/历史 id 的兜底：`getTemplate(id)` 未命中时回退 `classic`，与现在 `asTemplateId()` 行为一致
- 列表页 `TPL_LABEL` 改为从注册表派生（`getTemplate(id)?.name ?? "经典"`），不再硬编码

---

## 6. 字体管线

### 6.1 三款字体

| FontKey | 预览端（webfont） | PDF 端（文件） |
|---|---|---|
| `sans` | `@fontsource/noto-sans-sc`（已在依赖中） | `NotoSansSC-Regular.otf` + `NotoSansSC-Bold.otf`（noto-cjk SubsetOTF SC） |
| `serif` | `@fontsource/noto-serif-sc`（新增） | `NotoSerifSC-Regular.otf` + `NotoSerifSC-Bold.otf`（noto-cjk Serif SubsetOTF SC） |
| `kai` | `lxgw-wenkai-webfont`（新增，97 片 unicode-range 分片，浏览器按需加载） | `LXGWWenKai-Regular.ttf`（GitHub Release v1.520） |

字体文件 URL 均已实测可达（HTTP 200）。

### 6.2 既有缺陷与修复

当前存在两个真实缺陷，本次一并修复：

1. **PDF 粗体是假的**：`font.ts` 把 `NotoSansSC-Regular.otf` 同时注册为 `fontWeight: 400` 和 `700`，PDF 里粗体没有任何视觉加粗。→ 改为真正下载并注册 Bold 文件。
2. **Docker 容器内取不到字体**：`apps/web/.dockerignore` 排除了 `public/fonts/*`，注释写的是「运行时 npm run setup-fonts 下载」，但 `Dockerfile` 的 CMD 只跑 migrate + seed，**从未调用 setup:fonts** → 容器内 PDF 导出会因字体缺失而失败。
   → 修复：Dockerfile builder 阶段增加 `RUN npm run setup:fonts`；`.dockerignore` 放行 `scripts/setup-fonts.ts`（该文件当前也被排除，运行时下载脚本根本不存在于镜像中）。

### 6.3 `setup-fonts.ts` 重构

从「下载一个文件」改为「下载一份清单」：

```
FONT_MANIFEST = [
  { file: "NotoSansSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf" },
  { file: "NotoSansSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf" },
  { file: "NotoSerifSC-Regular.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf" },
  { file: "NotoSerifSC-Bold.otf",
    url: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf" },
  { file: "LXGWWenKai-Regular.ttf",
    url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.520/LXGWWenKai-Regular.ttf" },
]
```

- 幂等：已存在且大小 > 阈值则跳过
- 失败即退出码 1（构建期失败优于运行期失败）
- 保留现有单文件行为兼容（旧的 `NotoSansSC-Regular.otf` 路径不变）

### 6.4 字体注册与 fail-fast

`font.ts` 改为注册 3 个族：

```ts
const FAMILIES = {
  "Noto Sans SC":  ["NotoSansSC-Regular.otf", "NotoSansSC-Bold.otf"],
  "Noto Serif SC": ["NotoSerifSC-Regular.otf", "NotoSerifSC-Bold.otf"],
  "LXGW WenKai":   ["LXGWWenKai-Regular.ttf"],   // 无真粗体
};
```

- 注册前逐个检查文件存在，缺失则抛出**中文可读错误**：「字体资源缺失，请先运行 npm run setup:fonts」，而不是让 fontkit 抛出英文底层异常
- LXGW WenKai 无 Bold 字重：注册 `fontWeight: 700` 指向同一文件，并在实现阶段**实测** PDF 渲染效果；若 react-pdf 不合成粗体，则楷体模板的标题层级改用「色带 + 字号」表达，不依赖字重
- 字体族映射集中在 `lib/templates/fonts.ts`，HTML 与 PDF 共用同一份 `FontKey → family` 定义

### 6.5 字体体积

源文件合计约 50–60MB，存放在 `public/fonts/`（gitignore，不入库）。react-pdf 在生成 PDF 时按使用到的字形子集化嵌入，**最终 PDF 体积不受影响**。Docker 构建期一次性下载并入镜像层，运行期无延迟。

---

## 7. PDF 双端渲染

- `documents.tsx` 保留 `ResumeDocument` 入口签名（`{ data, template }`），内部改为查注册表 → 按 `layout` 分发到 7 个骨架实现
- 每个骨架一份 react-pdf 实现，结构与对应 HTML 骨架一一对应
- 样式统一由 `theme-styles.ts` 从 `ThemeTokens` 生成（`StyleSheet.create`），骨架代码只写结构不写颜色字号
- 分栏实现：react-pdf 无 flex/grid → 用固定宽度 `View`（如主栏 62% / 侧栏 38%）表达，宽度按 token 计算
- 保留现有 `RichHtml` 极简 HTML 解析器（支持 p/ul/ol/li/strong/em/br + 实体解码），不引入新依赖
- PDF 内**禁止 emoji**（缺字形会渲染为 .notdef 乱码），沿用现有约束与回归测试

---

## 8. 错误处理与降级

| 场景 | 处理 |
|---|---|
| 注册表里没有的 template id | `getTemplate()` 回退 `classic`；API 侧直接 400 |
| 范文数据缺字段 | `repairResumeData()` 归一化后再入库（沿用既有工具） |
| 字体文件缺失 | PDF 路由返回 500 + 中文提示「字体资源缺失，请运行 npm run setup:fonts」，不返回半成品 PDF |
| 单套模板渲染异常 | 该套模板降级到 `single-modern` 骨架 + 其 token，不让整页白屏 |
| 画廊缩略图懒加载失败 | 显示该套模板的占位块（模板名 + 风格组），不影响其他卡片 |

---

## 9. 测试策略

新增/改造的测试：

1. `lib/templates/registry.test.ts`
   - 32 条模板齐全，id 唯一且符合 kebab-case
   - 任意两套的「骨架 + 主色 + 字体 + 标题形态」四元组不重复
   - `getTemplate()` 未知 id 回退 `classic`
   - 每套 `sample` 通过 `ResumeDataSchema` 校验
   - `legacy` 三套的 id 与现有硬编码字面量一致
2. `lib/pdf/documents.test.ts`（扩写）
   - 32 套模板**全部**生成 PDF 并校验：页数 ≥1、中文可解码、无 emoji 乱码、字号与主色符合 token
   - 现有 3 套的既有断言保留
3. `lib/templates/samples.test.ts`
   - 3 份基线范文 schema 校验通过、字段非空
4. API 测试
   - `POST /api/resumes` 接受注册表内 id、拒绝表外 id（400）
5. e2e（Playwright）
   - `/templates` 加载、按风格组筛选、选中模板创建简历 → 跳转编辑器且内容为范文
   - 编辑器内切换模板 → 预览变化 → 刷新后保持

回归基线：`npm run typecheck`、`npm test`、`npm run build` 全绿；`/resumes`、`/resumes/<id>/edit`、`/settings`、`/templates` 均 200。

---

## 10. 验收标准

1. `/templates` 画廊页可用，32 套模板全部展示，缩略图为**真实渲染**效果（非静态图）
2. 风格组 / 场景 / 岗位三维筛选可叠加生效，搜索可用
3. 从模板新建的简历，内容为该模板范文，template 字段为该模板 id
4. 编辑器内可切换任意模板，预览即时更新并自动保存
5. 32 套模板**逐一**导出 PDF 均成功，中文正常、无乱码
6. 存量 3 套模板的 id、外观不变，存量简历渲染结果不变
7. Docker 镜像内 PDF 导出可用（字体随镜像内置）
8. 上述测试全绿，构建通过

---

## 11. 实施阶段划分

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P1 | 字体管线：`setup-fonts.ts` 清单化、`font.ts` 多族注册 + fail-fast、Dockerfile / .dockerignore 修复 | — |
| P2 | `lib/templates/`：types / registry / samples / fonts + 注册表测试 | P1 |
| P3 | HTML 渲染器重构：7 骨架 + token → CSS 变量 + 钩子变体 + 专属装饰层 | P2 |
| P4 | PDF 渲染器重构：7 骨架 react-pdf 实现 + `theme-styles.ts` | P3 |
| P5 | `/templates` 画廊页 + `TemplatePicker` + 懒加载缩略图 | P3 |
| P6 | 创建流程 / 编辑器换模板 / API 动态校验 / 列表页徽章 | P4, P5 |
| P7 | 测试补齐 + 视觉走查 + 全量回归 | 全部 |

---

## 12. 风险与取舍

| 风险 | 影响 | 缓解 |
|---|---|---|
| react-pdf 分栏能力弱 | 侧栏/双栏在 PDF 端与预览不完全一致 | 固定宽度 View 表达 + 骨架级 PDF 回归测试 + 装饰双端规则 |
| 楷体无 Bold | 楷体模板 PDF 标题不够突出 | 实测 faux bold；不可用则改用色带 + 字号表达层级 |
| 字体源文件 ~60MB | 仓库/镜像体积 | gitignore + 构建期下载 + PDF 子集化嵌入 |
| 32 套缩略图首屏重 | 画廊卡顿 | IntersectionObserver 懒加载 + 骨架占位 |
| 范文数据量大 | 维护成本 | 3 份基线范文 + 每套微调，不写 32 份完整数据 |
| 存量模板外观漂移 | 老用户看到的简历变了 | `classic/modern/minimal` 保留原 CSS 值，只做 token 化不改视觉 |

---

## 13. 参考

- 老鱼简历（https://www.laoyujianli.com/）—— 分类维度参考；页面为 umi SPA，无法直接抓取模板清单
- Noto CJK（notofonts/noto-cjk）—— `Sans/SubsetOTF/SC`、`Serif/SubsetOTF/SC`
- 霞鹜文楷（lxgw/LxgwWenKai）—— OFL-1.1
- `@fontsource/noto-serif-sc`、`lxgw-wenkai-webfont` —— 预览端 webfont
