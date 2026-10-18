/**
 * User repository — thin layer over Prisma for testability.
 * F1: 邮箱密码注册/登录
 */
import { prisma } from "./prisma";
import { hashPassword } from "./auth";

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  isAdmin?: boolean;
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      isAdmin: input.isAdmin ?? false,
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}