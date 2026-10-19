/**
 * Vitest 启动前注入测试用环境变量。
 * 不应被生产环境加载(vitest setupFiles 仅在测试时跑)。
 */
process.env.APP_SECRET = process.env.APP_SECRET || "vitest-test-app-secret-1234567890abcdef";
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "vitest-nextauth-secret-1234567890abcdef";
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";