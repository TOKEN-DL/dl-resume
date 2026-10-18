# #1 F1 注册/登录(邮箱密码 + 管理员 seed)

**优先级**:P0 · **状态**:待开始 · **里程碑**:M1 · **预计**:2 天

## 描述

邮箱密码注册/登录 + 启动时 seed 管理员账号。

## 验收(来自 PRD §2.1)

- 普通用户邮箱密码注册/登录(Argon2id 哈希)
- 管理员账号由环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` 启动时自动 seed
- 首次启动后关闭 seed 开关(防止覆盖)

## 子任务

- [ ] TDD:密码哈希单元测试(`hashPassword`、`verifyPassword`)
- [ ] TDD:用户创建/查找仓库测试
- [ ] Prisma migration:User 模型(`id`、`email` unique、`passwordHash`、`name`、`createdAt`)
- [ ] Auth.js (NextAuth v5) Credentials Provider 配置
- [ ] `/api/auth/register` POST 路由 + zod 校验
- [ ] `/login` 页面 + `/register` 页面
- [ ] 管理员 seed 脚本 `prisma/seed.ts`(只在 `seedAdminEnabled=true` 时跑)
- [ ] Playwright E2E:注册 → 自动登录 → 工作台

## 风险

- Argon2id 在 Windows 上编译慢 → 用 `@node-rs/argon2` 二进制版本
- 忘记密码后续走管理员重置流程(PRD §5)

## 关联

- **依赖**:脚手架 #0
- **被依赖**:F2(简历列表需要登录态)