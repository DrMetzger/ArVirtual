"use server";

import { aparelhoBloqueado, idDoAparelho } from "@/lib/aparelhos";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { conferirCodigo, enviarCodigo, exige2fa } from "@/lib/dois-fatores";
import {
  PENDING_2FA_COOKIE,
  pendingCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
  signPending,
  signSession,
  signTrusted,
  TRUSTED_COOKIE,
  trustedCookieOptions,
  verifyPending,
  verifyTrusted,
} from "@/lib/session";

type Estado = { erro?: string; ok?: string } | null;
const destinoSeguro = (d: string) => (d.startsWith("/") && !d.startsWith("//") ? d : "/");

async function abrirSessao(user: typeof usuarios.$inferSelect) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession({ sub: user.id, nome: user.nome, papel: user.papel }), sessionCookieOptions);
  jar.delete(PENDING_2FA_COOKIE);
}

export async function login(_: unknown, form: FormData): Promise<Estado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const destino = destinoSeguro(String(form.get("redirectTo") ?? "/"));
  // Celular bloqueado em Configurações › Aparelhos não entra, nem com a senha certa.
  if (await aparelhoBloqueado(idDoAparelho((await headers()).get("user-agent")))) {
    return { erro: "Este aparelho foi bloqueado pelo administrador. Fale com ele para liberar." };
  }

  const user = await db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  // Compara mesmo sem usuário para não revelar quais e-mails existem pelo tempo de resposta.
  const ok = await bcrypt.compare(senha, user?.senhaHash ?? "$2b$12$x8Kcopl2.6wglrN.TXyq/ONLaYWM9zDobK16BznHpRW1XbEP/GNNm");
  if (!user || !ok) return { erro: "E-mail ou senha incorretos." };

  if (await exige2fa(user)) {
    const jar = await cookies();
    const confiavel = await verifyTrusted(jar.get(TRUSTED_COOKIE)?.value);
    if (confiavel?.sub !== user.id) {
      try {
        await enviarCodigo(user, "login");
      } catch (e) {
        const msg = (e as Error).message;
        // Código pedido há menos de 1 minuto continua valendo: só segue para a tela do código.
        if (!msg.startsWith("Aguarde")) return { erro: `Não foi possível enviar o código por e-mail: ${msg}` };
      }
      jar.set(PENDING_2FA_COOKIE, await signPending({ sub: user.id, destino }), pendingCookieOptions);
      redirect("/login/verificar");
    }
  }

  await abrirSessao(user);
  redirect(destino);
}

async function usuarioPendente() {
  const pendente = await verifyPending((await cookies()).get(PENDING_2FA_COOKIE)?.value);
  if (!pendente) return null;
  const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, pendente.sub) });
  return user ? { user, destino: pendente.destino } : null;
}

export async function verificarCodigo(_: unknown, form: FormData): Promise<Estado> {
  const p = await usuarioPendente();
  if (!p) redirect("/login?expirou=1");
  const r = await conferirCodigo(p.user.id, "login", String(form.get("codigo") ?? ""));
  if (!r.ok) return { erro: r.erro };
  await abrirSessao(p.user);
  if (form.get("lembrar") === "on") (await cookies()).set(TRUSTED_COOKIE, await signTrusted(p.user.id), trustedCookieOptions);
  redirect(destinoSeguro(p.destino));
}

export async function reenviarCodigo(): Promise<Estado> {
  const p = await usuarioPendente();
  if (!p) redirect("/login?expirou=1");
  try {
    await enviarCodigo(p.user, "login");
    return { ok: `Enviamos um novo código para ${p.user.email}.` };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
