# 技术实现设计方案

> 版本: v0.1 · 日期: 2026-10-18 · 状态: 与 PRD 同步, 待开发启动

## 1. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | Next.js 15 (App Router) + TypeScript | 全栈一体, Server Components + Route Handlers 兼顾 SEO 与 API |
| 样式 | Tailwind CSS + shadcn/ui | 与 Reactive Resume 同款, 上手快, 主题统一 |
| 表单 | react-hook-form + zod | 结构化表单核心, schema-first |
| 富文本 | TipTap (StarterKit + Link) | 仅用于"个人简介/描述"段落 |
| 状态 | Zustand + TanStack Query | 简历编辑实时状态用 Zustand, 服务端数据用 TanStack Query |
| 数据库 | SQLite (MVP) → Postgres (生产) | MVP 零配置, 后续 Prisma 一行迁移 |
| ORM | Prisma | 类型安全, 迁移友好 |
| 认证 | Auth.js (NextAuth v5) Credentials Provider | 邮箱密码注册 + 启动时 seed 管理员账号 (env 读取) |
| 加密 | Node crypto (AES-256-GCM) + argon2 | 服务端不可读; 密钥派生 |
| PDF | @react-pdf/renderer | Reactive Resume 已验证可行 |
| 本地存储 | IndexedDB (idb-keyval) | 头像、自动保存草稿 |
| 验证 | zod (端到端) | 表单 + API + 数据库三层共用 |
| 国际化 | (MVP 不引入, 代码注释预留) | 仅中文, 后续接 react-i18next |
| 测试 | Vitest (单元) + Playwright (E2E) | 简历模板和 PDF 导出必须 E2E |
| 部署 | Docker Compose | Next.js standalone + Postgres 镜像 |

## 2. 项目结构

```
dl-resume/
├── apps/
│   └── web/                    # Next.js 应用
│       ├── app/
│       │   ├── (auth)/         # 登录/注册路由组
│       │   │   ├── login/
│       │   │   ├── register/
│       │   │   └── layout.tsx
│       │   ├── (dashboard)/    # 已登录路由组
│       │   │   ├── resumes/    # 我的简历列表
│       │   │   ├── resumes/[id]/edit/  # 编辑器
│       │   │   └── layout.tsx
│       │   ├── api/
│       │   │   ├── auth/[...nextauth]/
│       │   │   ├── resumes/    # CRUD
│       │   │   └── ai/         # 预留 AI 接口
│       │   ├── layout.tsx
│       │   └── page.tsx        # 落地页
│       ├── components/
│       │   ├── editor/         # 编辑器组件
│       │   │   ├── sections/   # 各模块表单
│       │   │   │   ├── basics.tsx
│       │   │   │   ├── summary.tsx
│       │   │   │   ├── education.tsx
│       │   │   │   ├── work.tsx
│       │   │   │   ├── projects.tsx
│       │   │   │   ├── skills.tsx
│       │   │   │   ├── languages.tsx
│       │   │   │   ├── awards.tsx
│       │   │   │   ├── certificates.tsx
│       │   │   │   └── interests.tsx
│       │   │   ├── preview/     # 右侧预览
│       │   │   │   └── ResumePreview.tsx
│       │   │   └── EditorShell.tsx
│       │   ├── pdf/             # @react-pdf 模板
│       │   │   ├── templates/
│       │   │   │   ├── classic/
│       │   │   │   ├── modern/
│       │   │   │   └── minimal/
│       │   │   └── ResumePdf.tsx
│       │   └── ui/              # shadcn/ui 封装
│       ├── lib/
│       │   ├── crypto.ts        # AES-256-GCM 封装
│       │   ├── key-derivation.ts # Argon2id
│       │   ├── jsonresume.ts    # JSON Resume schema 校验
│       │   ├── db.ts            # Prisma client
│       │   └── ai-provider.ts   # 预留 AI 接口
│       └── styles/
├── packages/
│   └── shared/                  # 共享类型/schema
│       ├── src/
│       │   ├── schema/
│       │   │   ├── resume.ts    # zod schema (JSON Resume 扩展)
│       │   │   └── index.ts
│       │   └── types/
│       └── package.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docker/
│   ├── Dockerfile.web
│   └── docker-compose.yml
├── tests/
│   └── e2e/
├── .env.example
├── package.json
├── turbo.json                    # Turborepo (可选)
└── README.md
```

> **简化提示**: 如果不想上 monorepo, 把 `packages/shared` 合并到 `apps/web/lib/` 即可。MVP 阶段推荐简化结构。

## 3. 数据模型 (Prisma Schema)

```prisma
// prisma/schema.prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String    // Argon2id hash
  salt          String    // Argon2 salt
  name          String?
  avatar        String?
  role          String    @default("user")  // "user" | "admin"
  // 加密简历用的数据加密密钥 (DEK), 用用户密码派生的 KEK 加密
  encryptedDek  String?   // base64, 用于简历加密
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  resumes       Resume[]
  sessions      Session[]
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
  sessionToken String   @unique
}

model Resume {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title         String   @default("未命名简历")
  templateId    String   @default("classic")  // classic | modern | minimal
  // 加密的简历 JSON (符合 JSON Resume schema + 扩展)
  encryptedData Bytes
  iv            Bytes    // AES-GCM IV
  authTag       Bytes    // AES-GCM auth tag
  // AI 产出预留字段(全部留 null)
  judgeScore    Int?
  judgeFeedback Json?
  interviewQuestions Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([userId, updatedAt])
}
```

## 4. JSON Resume Schema + 扩展

采用 https://jsonresume.org/schema 作为基础, 扩展点:

```typescript
// packages/shared/src/schema/resume.ts
import { z } from "zod";

const basicsSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),     // 求职意向
  email: z.string().email().optional(),
  phone: z.string().optional(),
  url: z.string().url().optional(),
  summary: z.string().optional(),   // 富文本 HTML (TipTap 输出)
  location: z.object({
    city: z.string().optional(),
    region: z.string().optional(),
  }).optional(),
  profiles: z.array(z.object({
    network: z.string(),
    username: z.string(),
    url: z.string().url().optional(),
  })).optional(),
});

const workSchema = z.object({
  name: z.string(),                 // 公司
  position: z.string(),             // 职位
  startDate: z.string(),            // ISO YYYY-MM
  endDate: z.string().optional(),   // 不填 = 至今
  summary: z.string().optional(),   // 富文本
  highlights: z.array(z.string()).optional(),
});

const educationSchema = z.object({
  institution: z.string(),
  area: z.string(),                 // 专业
  studyType: z.string(),            // 学历
  startDate: z.string(),
  endDate: z.string().optional(),
  score: z.string().optional(),     // 绩点/排名
  summary: z.string().optional(),
});

const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),   // 技术栈
  startDate: z.string(),
  endDate: z.string().optional(),
  url: z.string().url().optional(),
  roles: z.array(z.string()).optional(),
});

const skillSchema = z.object({
  name: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  keywords: z.array(z.string()).optional(),
});

const languageSchema = z.object({
  language: z.string(),
  fluency: z.string(),              // CEFR 或中文描述
});

const awardSchema = z.object({
  title: z.string(),
  date: z.string(),
  awarder: z.string(),
  summary: z.string().optional(),
});

const certificateSchema = z.object({
  name: z.string(),
  date: z.string(),
  issuer: z.string(),
  url: z.string().url().optional(),
});

export const resumeSchema = z.object({
  basics: basicsSchema,
  work: z.array(workSchema).default([]),
  education: z.array(educationSchema).default([]),
  projects: z.array(projectSchema).default([]),
  skills: z.array(skillSchema).default([]),
  languages: z.array(languageSchema).default([]),
  awards: z.array(awardSchema).default([]),
  certificates: z.array(certificateSchema).default([]),
  interests: z.array(z.object({
    name: z.string(),
    keywords: z.array(z.string()).optional(),
  })).default([]),
  // 扩展: 自定义模块 (允许 title + 自由文本)
  customSections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),            // 富文本
  })).default([]),
});
```

## 5. 加密策略

### 5.1 密钥派生
- 用户密码 → Argon2id(salt, t=3, m=64MB) → 256-bit **KEK** (Key Encryption Key)
- 注册时随机生成 256-bit **DEK** (Data Encryption Key)
- DEK 用 KEK 加密后存入 `User.encryptedDek`

### 5.2 数据加密
- 简历 JSON → AES-256-GCM(DEK, random IV) → `Resume.encryptedData` + `iv` + `authTag`

### 5.3 登录后流程
1. 邮箱密码登录 → 验证 Argon2id → 派生 KEK → 解密 `encryptedDek` 得到 DEK → 存入 session(不写 cookie, 仅服务端)
2. 每次读写 Resume: 用 session 内的 DEK 加解密

### 5.4 管理员账号
- 启动时读取环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` / `ADMIN_SEED_ENABLED`(默认 `true`)
- 首次启动若数据库无对应 email 的 User, 则自动创建管理员账号:
  - `role = "admin"`
  - `passwordHash` / `salt` / `encryptedDek` 走与普通用户一致的流程(用 `ADMIN_PASSWORD` 派生 KEK, 加密 DEK)
  - 管理员的简历数据同样端到端加密, 服务端不可读
- 管理员**不能**解密其他用户的简历(无对应密码派生不出 KEK), 仅作为应急入口与平台运营账号
- 首次启动成功后建议在 `.env` 中设置 `ADMIN_SEED_ENABLED=false`, 防止误覆盖
- 管理员登录后与普通用户看到同一个 UI, 仅 `role=admin` 在后续迭代中可用于解锁管理后台(用户列表 / 封禁 / 强制下线等)

### 5.5 密码重置
- MVP 阶段: 邮箱密码重置 → 用户必须输入旧密码才能保留数据
- 不输入旧密码: 仅删除服务端简历数据(本地 IndexedDB 不动)

## 6. 编辑器架构

### 6.1 布局
```
┌────────────────────────────────────────────────────┐
│ Topbar: 简历标题(可编辑) | 模板切换 | 导出 PDF | 保存状态 │
├──────────────────────┬─────────────────────────────┤
│                      │                             │
│  左侧: 表单 (60%)    │  右侧: 实时预览 (40%)        │
│                      │                             │
│  ▾ 基本信息          │  ┌───────────────────────┐  │
│  ▾ 个人简介          │  │                       │  │
│  ▾ 教育背景 [+新增]  │  │   A4 简历预览          │  │
│  ▾ 工作经历 [+新增]  │  │   (DOM 渲染,非 PDF)   │  │
│  ▸ 项目经历          │  │                       │  │
│  ▸ 专业技能          │  └───────────────────────┘  │
│                      │                             │
└──────────────────────┴─────────────────────────────┘
```

### 6.2 数据流
```
用户输入
  ↓ react-hook-form (debounce 200ms)
Zustand store (简历全局状态)
  ├──→ 右侧 Preview (DOM 渲染, 用于屏幕)
  ├──→ IndexedDB (每 5s 防抖保存草稿)
  └──→ Server Action (每 30s 或路由切换时加密上传)

导出 PDF
  ↓
@react-pdf/renderer (基于同一份 Zustand state 渲染, 不再走 DOM)
```

### 6.3 关键技术点
- **预览与 PDF 同源数据**: 同一份 zustand state, 预览用 HTML/CSS, PDF 用 @react-pdf 组件
- **TipTap 集成**: 仅在 `summary` / `work.summary` / `project.description` 等字段用, 其他字段是纯 input
- **模块可重排**: 左侧表单模块顺序由 zustand 中的 `sectionOrder` 数组控制, 用户可上下移动
- **模板切换实时**: 右侧 preview 直接订阅 `templateId`, 切换无需重渲染表单

## 7. PDF 导出 (@react-pdf/renderer)

### 7.1 模板结构
```typescript
// components/pdf/templates/classic/index.tsx
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "NotoSansSC-Regular" },
  header: { borderBottom: "1pt solid #000", paddingBottom: 8, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: 700 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, borderBottom: "0.5pt solid #ccc", marginBottom: 4 },
});

export const ClassicTemplate = ({ resume }: { resume: Resume }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* 字体注册 (思源黑体子集) */}
      <Font registry={{ NotoSansSC: { src: ..., fontStyle: "normal" } }} />

      {/* 基本信息 */}
      <View style={styles.header}>
        <Text style={styles.name}>{resume.basics.name}</Text>
        <Text>{resume.basics.label}</Text>
      </View>

      {/* 简介 */}
      <Section title="个人简介">
        <RichTextRenderer html={resume.basics.summary} />
      </Section>

      {/* 工作经历 */}
      {resume.work.map(w => (
        <Section key={w.name + w.startDate} title={w.name}>
          <Text>{w.position} | {formatDate(w.startDate)} - {w.endDate ? formatDate(w.endDate) : "至今"}</Text>
          <RichTextRenderer html={w.summary} />
        </Section>
      ))}
      ...
    </Page>
  </Document>
);
```

### 7.2 字体处理
- 内置思源黑体 Regular 子集(预计 < 800KB)
- `await document.fonts.ready` 后再触发导出
- 提供字体缺失时的 fallback

### 7.3 富文本 → PDF
TipTap 输出 HTML, 写一个轻量 HTML 解析器(支持 h1-h3, p, ul, ol, li, a, strong, em) 转为 @react-pdf 组件。MVP 阶段正则匹配即可, 后续可换 html-react-parser 的轻量子集。

## 8. AI 接口预留

```typescript
// lib/ai-provider.ts
export interface AIProvider {
  judgeResume(resume: Resume): Promise<{
    score: number;            // 0-100
    feedback: {
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
    };
  }>;

  generateInterviewQuestions(resume: Resume, opts?: {
    count?: number;           // 默认 100
    difficulty?: "easy" | "medium" | "hard" | "mixed";
    focus?: string[];         // 重点领域
  }): Promise<Array<{
    question: string;
    category: string;
    difficulty: string;
    answer: string;
    reasoning: string;
  }>>;
}

// MVP 阶段: 抛 "Not implemented"
export class StubAIProvider implements AIProvider {
  async judgeResume() { throw new Error("AI not implemented in v1.0"); }
  async generateInterviewQuestions() { throw new Error("AI not implemented in v1.0"); }
}
```

后续接 OpenAI / DeepSeek / 自部署 LLM 时, 只需替换实现。

## 9. 部署架构

### 9.1 Docker Compose
```yaml
# docker/docker-compose.yml
version: "3.9"
services:
  web:
    build: 
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://resume:resume@db:5432/resume
      - NEXTAUTH_URL=https://your-domain.com
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - ADMIN_NAME=${ADMIN_NAME:-Administrator}
      - ADMIN_SEED_ENABLED=${ADMIN_SEED_ENABLED:-true}
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=resume
      - POSTGRES_PASSWORD=resume
      - POSTGRES_DB=resume
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 9.2 Dockerfile (standalone Next.js)
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

## 10. 开发路线图

### Phase 1: 基础骨架 (3–4 天)
- [ ] Next.js 15 项目初始化 + Tailwind + shadcn/ui
- [ ] Prisma + SQLite 接入
- [ ] Auth.js Credentials Provider 配置 + 管理员账号 seed 脚本 (env 读取)
- [ ] AES-256-GCM 加密工具实现
- [ ] 简历 schema 定义 (zod, 基于 JSON Resume)

### Phase 2: 编辑器核心 (7–10 天)
- [ ] 9 个模块的表单组件实现
- [ ] TipTap 富文本集成(简介/描述)
- [ ] Zustand store 搭建
- [ ] 左侧编辑器 + 右侧实时预览
- [ ] IndexedDB 自动保存
- [ ] 模块排序 / 折叠

### Phase 3: PDF 模板 (5–7 天)
- [ ] @react-pdf/renderer 基础
- [ ] 3 个模板实现 (classic / modern / minimal)
- [ ] 思源黑体子集嵌入
- [ ] 富文本 → PDF 渲染
- [ ] 导出按钮 + 客户端下载

### Phase 4: 简历管理 (3 天)
- [ ] 我的简历列表 + CRUD
- [ ] 复制简历 / 重命名 / 删除
- [ ] JSON Resume 导入 / 导出

### Phase 5: 打磨 + 测试 (3–5 天)
- [ ] Playwright E2E (创建 → 编辑 → 导出全流程)
- [ ] 加密端到端验证
- [ ] 部署文档 + Docker compose

**总计: 3–4 周**(单人开发, 全栈熟练)

## 11. 待确认事项 (开发启动前)

1. ✅ 技术栈 / 编辑器架构 / PDF 方案 / MVP 范围 — 已定
2. ✅ 自定义模块灵活度 / 模板数量 / 登录方式 / 数据格式 — 已定
3. ✅ 多语言 / 部署 / AI 预留 / 隐私策略 — 已定
4. ⏳ **管理员账号凭证**: 在 `.env` 中设置 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`(强密码, ≥16 位), 首次启动后建议关闭 seed 开关 (`ADMIN_SEED_ENABLED=false`)
5. ⏳ **品牌名**: 项目名 / 包名 / docker 镜像名
6. ⏳ **LICENSE**: MIT(对齐 Reactive Resume)
7. ⏳ **Next.js 15 + React 19 的 @react-pdf 兼容性**: 开发第一天需 smoke test