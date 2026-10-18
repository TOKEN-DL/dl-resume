# #0 阶段 0:基础设施(脚手架)

**优先级**:P0 · **状态**:进行中 · **里程碑**:M0 · **预计**:0.5 天

## 目标

让项目能 `npm run dev` 跑起来,后续 issue 都有地方写代码。

## 子任务

- [ ] Next.js 15 + TypeScript + Tailwind CSS 项目脚手架
- [ ] Prisma + SQLite 接入,`schema.prisma` 包含 User 和 Resume 模型
- [ ] ESLint + Prettier + lint-staged + Husky
- [ ] Vitest 配置(单测)
- [ ] Playwright 配置(E2E)
- [ ] .env.example 模板(管理员账号、数据库 URL、JWT secret)
- [ ] README 替换为开发指南

## 验收

```bash
git clone <repo>
npm install
npx prisma migrate dev
npm run dev
# → http://localhost:3000 出现 "Hello World" 或同等占位
npm test
# → 0 个失败的测试
```

## 关联

- **依赖**:无
- **被依赖**:F1-F19 全部