import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { appDesatualizado } from "./app-android";
import { aparelhoBloqueado, idDoAparelho } from "./aparelhos";
import { SESSION_COOKIE, verifySession } from "./session";

/** Sessão atual; redireciona para o login se não houver. Use em toda página/ação protegida. */
export const requireUser = cache(async () => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  // Celular bloqueado em Configurações › Aparelhos perde o acesso na hora (até com a sessão aberta).
  const ua = (await headers()).get("user-agent");
  if (await aparelhoBloqueado(idDoAparelho(ua))) redirect("/bloqueado");
  // App do celular numa versão antiga: não usa o sistema até atualizar.
  if (await appDesatualizado(ua)) redirect("/atualizar-app");
  return session;
});

export async function requireAdmin() {
  const user = await requireUser();
  if (user.papel !== "admin") throw new Error("Apenas administradores podem fazer isso.");
  return user;
}
