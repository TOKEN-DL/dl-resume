# ─── deps stage ───────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./
# 装 Prisma 客户端 + Next.js 依赖
RUN npm ci --ignore-scripts
# Prisma 需要生成 client
COPY apps/web/prisma ./prisma
RUN npx prisma generate

# ─── builder stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./

# 用占位符让 build 通过;真实值在 runtime 通过 env 注入
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:./build-placeholder.db"
ENV NEXTAUTH_SECRET="build-placeholder-secret-1234567890"
ENV APP_SECRET="build-placeholder-secret-1234567890"
ENV SEED_ADMIN_ENABLED="false"

RUN npx prisma generate
# 字体必须在构建期下载:容器运行时没有网络,且 PDF 导出依赖这些字体文件
RUN npm run setup:fonts
RUN npm run build

# ─── runner stage ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

# standalone 输出目录: /app/apps/web/.next/standalone/apps/web
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./apps/web/prisma

# 数据持久化目录
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
ENV DATABASE_URL="file:/app/data/dev.db"

USER nextjs

EXPOSE 3000

# 启动:先 migrate deploy + seed,再起 server
CMD ["sh", "-c", "npx prisma migrate deploy && (echo \"$SEED_ADMIN_ENABLED\" | grep -qi true && npx prisma db seed || true) && node apps/web/server.js"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1