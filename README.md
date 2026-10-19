# 简册 — 简历系统

> 面向中文求职者的开源简历系统。
> 结构化分块编辑 + 实时预览 + 客户端 PDF 导出 + 服务端加密 + 可自托管。

完整 PRD 见 [PRD.md](./PRD.md),架构设计见 [ARCHITECTURE.md](./ARCHITECTURE.md),
任务分解见 [issues/](./issues/)。

## 功能完成度

| # | 功能 | 状态 |
|---|---|---|
| F1 | 邮箱密码注册/登录 | ✅ #1 |
| F2 | 我的简历列表 CRUD | ✅ #2 |
| F3 | 模板选择(经典/现代/极简) | ✅ #3 |
| F4–F13 | 10 个模块表单 | ✅ #3(含在编辑器中) |
| F14 | 自动保存(IndexedDB + 服务端) | ✅ #3 |
| F15 | 分屏编辑器(左编辑右预览) | ✅ #3 |
| F16 | 客户端 PDF 导出(@react-pdf/renderer) | ✅ #4 |
| F17 | JSON Resume 导入/导出 | ✅ #5 |
| F18 | 服务端加密(AES-256-GCM) | ✅ #6 |
| F19 | 账户注销级联删除 | ✅ #7 |
| F14 | Docker 自托管部署 | ✅ #8 |

## 技术栈

- **前端**: Next.js 15(React 19)+ Tailwind CSS + TipTap(富文本)+ idb-keyval(草稿)
- **后端**: Next.js Route Handlers + zod(校验)+ jose(JWT session)
- **数据**: Prisma 6 + SQLite(默认)/ Postgres(可选)
- **密码**: Argon2id(@node-rs/argon2,OWASP 2024 参数)
- **加密**: AES-256-GCM(Node crypto,12-byte IV)
- **PDF**: @react-pdf/renderer 4.x(server-side, Noto Sans SC)
- **测试**: vitest 2.x(mock Prisma + pdf-lib 解析)

## 本地开发

### 前置

- Node.js ≥ 22
- npm ≥ 10
- Windows / macOS / Linux 都行

### 安装

```bash
git clone <this-repo>
cd dl-resume/apps/web
npm install
npx prisma migrate deploy
npx prisma db seed                # 创建管理员(admin@example.com / changeme-on-first-login)
npm run setup:fonts               # 下载 Noto Sans SC(~8MB)用于 PDF 中文渲染
```

### 启动 dev

```bash
npm run dev
# http://localhost:3000
```

### 跑测试

```bash
npm test           # 单测 94 个
npx tsc --noEmit   # 类型检查
```

### 环境变量(可选)

复制 `apps/web/.env.example` 到 `.env`,按需修改。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite 默认;Postgres 用 `postgresql://...` |
| `NEXTAUTH_SECRET` | dev 占位 | JWT session 签名,**生产必须用 `openssl rand -base64 32`** |
| `APP_SECRET` | dev 占位 | 简历加密 master key 派生盐,**生产必须用 `openssl rand -base64 32`** |
| `ADMIN_EMAIL` | `admin@example.com` | 管理员账号 |
| `ADMIN_PASSWORD` | `changeme-on-first-login` | 管理员密码(**生产必须改**) |
| `ADMIN_NAME` | `Admin` | 管理员姓名 |
| `SEED_ADMIN_ENABLED` | `true` | 首次启动后改成 `false` 防止重复创建 |

## Docker 部署(单条命令起)

### 前置

- Docker ≥ 24 + docker compose plugin

### 启动

```bash
# 1. 复制并填充环境变量
cp apps/web/.env.docker.example .env
# 编辑 .env: 修改 NEXTAUTH_SECRET / APP_SECRET / ADMIN_PASSWORD
openssl rand -base64 32  # 生成两个密钥
openssl rand -base64 32

# 2. 起服务
docker compose up -d

# 3. 查看日志(应看到 seed 输出管理员)
docker compose logs -f web

# 4. 浏览器访问 http://localhost:3000
```

数据持久化在 `./data/` 目录(数据库 + 字体)。

### 升级

```bash
docker compose build --no-cache
docker compose up -d
```

### 健康检查

`GET /api/health` → `{"status":"ok"}`

## 加密策略

**MVP 简化方案**: 部署者密钥(APP_SECRET env)派生 master key,AES-256-GCM 加密每条简历 data 字段。

- ✅ 数据库 dump 中 data 字段全是密文 base64,无明文
- ✅ 旧明文自动 fallback 兼容,迁移平滑
- ✅ 用户改密码不影响加密(简化数据流)
- ⚠️ **非 E2E**: 部署者(运维)理论上能解密。**严格端到端加密(用户密码派生 KEK + 包装 DEK)在 v1.1 引入**。

数据库中存储格式:
```
v1.enc:{iv}.{ct+tag}    ← 新加密数据
{"basics":{"name":...}}  ← 旧明文(自动 fallback,可在迁移完成后清理)
```

## 注意事项

- **`APP_SECRET` 千万不能丢**: 丢了 = 数据库中所有简历无法解密。备份它。
- **管理员重置密码不重加密**: 数据仍可解密(F18 简化方案)。
- **Next.js standalone**: Dockerfile 已配置 `output: "standalone"`,镜像只含必要文件,~150MB。

## License

TBD — 见后续 LICENSE 文件。