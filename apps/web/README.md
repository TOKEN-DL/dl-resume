# 简册 · dl-resume-web

Next.js 15 应用主体。

## 开发

```bash
# 安装依赖(首次)
npm install

# 数据库初始化
cp .env.example .env
# 编辑 .env 填入 ADMIN_EMAIL / ADMIN_PASSWORD 等

npx prisma migrate dev    # 应用 schema,生成 client
npx prisma db seed        # 启动时自动 seed 管理员(若 SEED_ADMIN_ENABLED=true)

# 启动开发服务
npm run dev               # → http://localhost:3000
```

## 测试

```bash
npm test                  # Vitest 单测
npm run test:watch        # 监听模式
npm run e2e               # Playwright E2E
npm run typecheck         # TypeScript 类型检查
npm run lint              # ESLint
```

## 目录约定

```
apps/web/
├── prisma/
│   ├── schema.prisma        # 数据模型
│   └── seed.ts              # 管理员 seed(issue #1)
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (auth)/          # 登录/注册路由组(issue #1)
│   │   ├── (dashboard)/     # 已登录路由组(issue #2)
│   │   ├── api/             # Route Handlers
│   │   ├── layout.tsx       # 根布局
│   │   └── page.tsx         # 落地页(临时,登录后跳工作台)
│   ├── components/
│   │   ├── editor/          # 编辑器(issue #8)
│   │   ├── preview/         # 模板预览(issue #3)
│   │   └── ui/              # shadcn/ui 组件
│   ├── lib/
│   │   ├── prisma.ts        # Prisma client 单例
│   │   ├── auth.ts          # 认证工具(issue #1)
│   │   ├── crypto.ts        # AES-256-GCM(issue #12)
│   │   └── validation/      # zod schema
│   └── stores/              # Zustand stores
├── public/
├── .env.example
├── next.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 当前进度

- ✅ 阶段 0:脚手架 + Prisma + Tailwind + 字体
- 🚧 等待 npm install(用户自己跑)
- ⏳ issue #1 登录

详细任务清单见 `../../issues/`。