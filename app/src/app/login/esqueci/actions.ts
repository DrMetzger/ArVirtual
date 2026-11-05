"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { conferirCodigo, emailConfigurado, enviarCodigo } from "@/lib/dois-fatores";

export type EstadoEsqueci = { etapa: "email" | "codigo"; email: string; erro?: string; aviso?: string } | null;

const acharUsuario = (email: string) => db.query.usuarios.findFirst({ where: sql`lower(${usuarios.email}) = ${email.trim().toLowerCase()}` });

/**
 * Esqueci minha senha. 1º passo: manda um código de 6 dígitos para o e-mail (vale 10 min). A resposta é a mesma com ou
 * sem cadastro, para ninguém descobrir quais e-mails existem. 2º passo: código + senha nova.
 */
export async function esqueciSenha(estado: EstadoEsqueci, form: FormData): Promise<EstadoEsqueci> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { etapa: "email", email, erro: "Informe o e-mail cadastrado." };

  // Sem código e sem senha = pedir (ou pedir de novo) o código.
  if (!String(form.get("codigo") ?? "").trim() && !String(form.get("senha") ?? "")) {
    if (!(await emailConfigurado())) return { etapa: "email", email, erro: "O envio de e-mail não está configurado. Peça ao administrador para trocar sua senha em Configurações › Usuários." };
    const user = await acharUsuario(email);
    if (user) {
      try {
        await enviarCodigo(user, "senha");
      } catch (e) {
        const msg = (e as Error).message;
        // Pediu de novo antes de 1 minuto: o código anterior ainda vale.
        if (!/Aguarde/.test(msg)) return { etapa: "email", email, erro: `Não consegui enviar o e-mail: ${msg}` };
      }
    }
    return { etapa: "codigo", email, aviso: "Se este e-mail estiver cadastrado, enviamos um código de 6 dígitos. Ele vale por 10 minutos (veja também o spam)." };
  }

  const codigo = String(form.get("codigo") ?? "");
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return { etapa: "codigo", email, erro: "A senha nova precisa ter pelo menos 8 caracteres." };
  if (senha !== String(form.get("confirmar") ?? "")) return { etapa: "codigo", email, erro: "As duas senhas não são iguais." };
  const user = await acharUsuario(email);
  if (!user) return { etapa: "codigo", email, erro: "Código incorreto ou expirado. Peça um novo." };
  const r = await conferirCodigo(user.id, "senha", codigo);
  if (!r.ok) return { etapa: "codigo", email, erro: r.erro };
  await db.update(usuarios).set({ senhaHash: await bcrypt.hash(senha, 12), atualizadoEm: new Date() }).where(eq(usuarios.id, user.id));
  redirect("/login?senha=ok");
}
