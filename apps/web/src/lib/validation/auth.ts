/**
 * Auth validation schemas — zod.
 * F1: 邮箱密码注册/登录
 */
import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("邮箱格式不正确"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(128, "密码最多 128 位"),
  name: z
    .string()
    .trim()
    .min(1, "姓名不能为空")
    .max(60, "姓名最多 60 字"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(1, "密码不能为空"),
});

export type LoginInput = z.infer<typeof loginSchema>;