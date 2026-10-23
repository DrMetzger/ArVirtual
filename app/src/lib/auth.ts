import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, verifySession } from "./session";

/** Sessão atual; redireciona para o login se não houver. Use em toda página/ação protegida. */
export const requireUser = cache(async () => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return session;
});

export async function requireAdmin() {
  const user = await requireUser();
  if (user.papel !== "admin") throw new Error("Apenas administradores podem fazer isso.");
  return user;
}
