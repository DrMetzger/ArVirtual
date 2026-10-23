"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export async function login(_: unknown, form: FormData): Promise<{ erro: string } | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const destino = String(form.get("redirectTo") ?? "/");

  const user = await db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  // Compara mesmo sem usuário para não revelar quais e-mails existem pelo tempo de resposta.
  const ok = await bcrypt.compare(senha, user?.senhaHash ?? "$2b$12$x8Kcopl2.6wglrN.TXyq/ONLaYWM9zDobK16BznHpRW1XbEP/GNNm");
  if (!user || !ok) return { erro: "E-mail ou senha incorretos." };

  const token = await signSession({ sub: user.id, nome: user.nome, papel: user.papel });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
