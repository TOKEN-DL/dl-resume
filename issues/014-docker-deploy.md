# #14 Docker 自托管部署

**优先级**:P1 · **里程碑**:M3 · **预计**:1 天

## 验收

- `docker compose up -d` 起整个应用
- 一条命令,无需其他配置

## 子任务

- [ ] Next.js standalone 输出配置
- [ ] Dockerfile 多阶段构建(node:22-alpine)
- [ ] docker-compose.yml:Next.js 服务 + (可选)Postgres 服务
- [ ] 生产环境变量:`NEXTAUTH_SECRET`、`DATABASE_URL`、`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`
- [ ] 健康检查 `/api/health`
- [ ] README "部署"章节更新
- [ ] E2E:Docker 容器内 `curl http://localhost:3000` 返 200

## 关联

- **依赖**:F1-F19 全部 P0
- **被依赖**:无