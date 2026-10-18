/**
 * 启动时 seed 管理员账号 — 来自 PRD §2.1 F1。
 *
 * 由 SEED_ADMIN_ENABLED 控制:仅首次启动或显式设置时为 true,
 * 之后关闭(避免重启时覆盖现有管理员密码)。
 *
 * 运行:npx prisma db seed
 *  或者:tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  if (process.env.SEED_ADMIN_ENABLED !== "true") {
    console.log("[seed] SEED_ADMIN_ENABLED != 'true', skip");
    return;
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.warn("[seed] ADMIN_EMAIL or ADMIN_PASSWORD missing, skip");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] admin ${email} already exists, skip`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      isAdmin: true,
    },
  });

  console.log(`[seed] created admin: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });