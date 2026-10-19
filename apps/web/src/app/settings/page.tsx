/**
 * /settings — 账户设置(注销).
 * F19
 *
 * 服务端:鉴权 + 取当前用户 → 交给 client
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/settings");

  return (
    <SettingsClient
      email={session.email}
      isAdmin={session.isAdmin}
    />
  );
}