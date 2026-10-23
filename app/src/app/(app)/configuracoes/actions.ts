"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { certificadoDigital, contasEmail, empresa, usuarios } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { enviarCertificadoFocus, lerCertificado } from "@/lib/fiscal/certificado";
import { isValidCnpj } from "@/lib/documento";
import { gerarComGemini } from "@/lib/gemini";
import { enviarEmail } from "@/lib/mail";
import { SETTINGS, setSetting, type SettingKey } from "@/lib/settings";
import { onlyDigits } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;
const str = z.string().trim();
const falha = (e: unknown): FormState => ({ erro: (e as Error).message });

// ---------- Empresa ----------
const EmpresaSchema = z.object({
  razaoSocial: str.min(2, "Informe a razão social"),
  nomeFantasia: str.default(""),
  cnpj: str.transform(onlyDigits).refine(isValidCnpj, "CNPJ inválido"),
  inscricaoEstadual: str.default(""),
  inscricaoMunicipal: str.default(""),
  regime: z.coerce.number().int().min(1).max(4),
  cep: str.transform(onlyDigits),
  logradouro: str,
  numero: str,
  complemento: str.default(""),
  bairro: str,
  cidade: str,
  uf: str.length(2),
  codigoIbge: str.transform(onlyDigits).default(""),
  telefone: str.transform(onlyDigits).default(""),
  email: str.default(""),
});

export async function salvarEmpresa(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const parsed = EmpresaSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    await db
      .insert(empresa)
      .values({ id: 1, ...parsed.data })
      .onConflictDoUpdate({ target: empresa.id, set: parsed.data });
    revalidatePath("/", "layout");
    return { ok: "Dados da empresa salvos." };
  } catch (e) {
    return falha(e);
  }
}

// ---------- Integrações ----------
export async function salvarIntegracoes(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const grupo = String(form.get("grupo"));
    const chaves = (Object.keys(SETTINGS) as SettingKey[]).filter((k) => SETTINGS[k].group === grupo);
    for (const k of chaves) {
      const valor = String(form.get(k) ?? "").trim();
      const limpar = form.get(`${k}__limpar`) === "on";
      // Campo secreto vazio = manter o valor atual (a tela nunca recebe o segredo de volta).
      if (SETTINGS[k].secret && !valor && !limpar) continue;
      await setSetting(k, limpar ? "" : valor);
    }
    revalidatePath("/configuracoes");
    return { ok: `${grupo}: salvo.` };
  } catch (e) {
    return falha(e);
  }
}

export async function testarGemini(): Promise<FormState> {
  try {
    await requireUser();
    const r = await gerarComGemini([{ role: "user", text: "Responda apenas: OK, conectado." }], { temperature: 0 });
    return { ok: `Gemini respondeu: ${r.trim().slice(0, 80)}` };
  } catch (e) {
    return falha(e);
  }
}

// ---------- E-mails ----------
const EmailSchema = z.object({
  nome: str.min(1, "Dê um nome para a conta"),
  host: str.min(3, "Informe o servidor SMTP"),
  porta: z.coerce.number().int().min(1).max(65535),
  usuario: str.min(1, "Informe o usuário"),
  remetenteNome: str.min(1, "Informe o nome do remetente"),
  remetenteEmail: z.email("E-mail do remetente inválido"),
});

export async function salvarContaEmail(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const parsed = EmailSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    const id = Number(form.get("id") ?? 0);
    const senha = String(form.get("senha") ?? "");
    const padrao = form.get("padrao") === "on";
    const valores = { ...parsed.data, seguro: form.get("seguro") === "on", padrao, ...(senha ? { senhaEnc: encrypt(senha) } : {}) };

    await db.transaction(async (tx) => {
      let contaId = id;
      if (id) await tx.update(contasEmail).set(valores).where(eq(contasEmail.id, id));
      else {
        if (!senha) throw new Error("Informe a senha da conta.");
        const existe = await tx.$count(contasEmail);
        const [nova] = await tx
          .insert(contasEmail)
          .values({ ...valores, senhaEnc: encrypt(senha), padrao: padrao || existe === 0 })
          .returning({ id: contasEmail.id });
        contaId = nova!.id;
      }
      if (padrao) await tx.update(contasEmail).set({ padrao: false }).where(ne(contasEmail.id, contaId));
    });
    revalidatePath("/configuracoes");
    return { ok: "Conta de e-mail salva." };
  } catch (e) {
    return falha(e);
  }
}

export async function excluirContaEmail(id: number) {
  await requireAdmin();
  await db.delete(contasEmail).where(eq(contasEmail.id, id));
  revalidatePath("/configuracoes");
}

export async function testarContaEmail(id: number): Promise<FormState> {
  try {
    const session = await requireUser();
    const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, session.sub) });
    if (!user) throw new Error("Usuário não encontrado.");
    await enviarEmail({
      contaId: id,
      para: user.email,
      assunto: "Teste de e-mail · ArVirtual",
      html: "<p>Tudo certo! Esta conta de e-mail está configurada no sistema ArVirtual.</p>",
    });
    return { ok: `E-mail de teste enviado para ${user.email}.` };
  } catch (e) {
    return falha(e);
  }
}

// ---------- Usuários ----------
const UsuarioSchema = z.object({
  nome: str.min(2, "Informe o nome"),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  senha: z.string().min(10, "A senha precisa ter ao menos 10 caracteres"),
  papel: z.enum(["admin", "usuario"]),
});

export async function criarUsuario(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const parsed = UsuarioSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    const { senha, ...d } = parsed.data;
    if (await db.query.usuarios.findFirst({ where: eq(usuarios.email, d.email) })) return { erro: "E-mail já cadastrado." };
    await db.insert(usuarios).values({ ...d, senhaHash: await bcrypt.hash(senha, 12) });
    revalidatePath("/configuracoes");
    return { ok: `Usuário ${d.nome} criado.` };
  } catch (e) {
    return falha(e);
  }
}

export async function excluirUsuario(id: string) {
  const me = await requireAdmin();
  if (id === me.sub) return;
  await db.delete(usuarios).where(and(eq(usuarios.id, id), ne(usuarios.id, me.sub)));
  revalidatePath("/configuracoes");
}

export async function alterarSenha(_: FormState, form: FormData): Promise<FormState> {
  try {
    const me = await requireUser();
    const atual = String(form.get("atual") ?? "");
    const nova = String(form.get("nova") ?? "");
    if (nova.length < 10) return { erro: "A nova senha precisa ter ao menos 10 caracteres." };
    const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, me.sub) });
    if (!user || !(await bcrypt.compare(atual, user.senhaHash))) return { erro: "Senha atual incorreta." };
    await db.update(usuarios).set({ senhaHash: await bcrypt.hash(nova, 12) }).where(eq(usuarios.id, me.sub));
    return { ok: "Senha alterada." };
  } catch (e) {
    return falha(e);
  }
}

// ---------- Certificado digital A1 ----------
async function enviarParaFocus(arquivo: Buffer, senha: string) {
  const emp = await db.query.empresa.findFirst();
  try {
    if (!emp?.cnpj) throw new Error("Cadastre o CNPJ da empresa na aba Empresa.");
    const msg = await enviarCertificadoFocus(arquivo, senha, emp.cnpj);
    await db.update(certificadoDigital).set({ enviadoFocusEm: new Date(), mensagemFocus: msg }).where(eq(certificadoDigital.id, 1));
    return { ok: true, msg };
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(certificadoDigital).set({ mensagemFocus: msg }).where(eq(certificadoDigital.id, 1));
    return { ok: false, msg };
  }
}

export async function salvarCertificado(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const file = form.get("arquivo");
    const senha = String(form.get("senha") ?? "");
    if (!(file instanceof File) || file.size === 0) return { erro: "Selecione o arquivo do certificado (.pfx ou .p12)." };
    if (file.size > 100 * 1024) return { erro: "Arquivo grande demais para um certificado A1." };
    if (!senha) return { erro: "Informe a senha do certificado." };

    const arquivo = Buffer.from(await file.arrayBuffer());
    const info = lerCertificado(arquivo, senha);
    if (info.validoAte.getTime() < Date.now()) return { erro: `Certificado vencido em ${info.validoAte.toLocaleDateString("pt-BR")}.` };

    const valores = {
      arquivoEnc: encrypt(arquivo.toString("base64")),
      senhaEnc: encrypt(senha),
      nomeArquivo: file.name,
      ...info,
      enviadoFocusEm: null,
      mensagemFocus: "",
    };
    await db.insert(certificadoDigital).values({ id: 1, ...valores }).onConflictDoUpdate({ target: certificadoDigital.id, set: valores });

    const emp = await db.query.empresa.findFirst();
    const aviso = emp?.cnpj && info.cnpj && emp.cnpj !== info.cnpj ? ` Atenção: o CNPJ do certificado (${info.cnpj}) é diferente do CNPJ da empresa (${emp.cnpj}).` : "";
    const focus = await enviarParaFocus(arquivo, senha);
    revalidatePath("/", "layout");
    return focus.ok
      ? { ok: `Certificado salvo e enviado à Focus NFe. ${focus.msg}${aviso}` }
      : { ok: `Certificado salvo.${aviso}`, erro: `Não foi enviado à Focus: ${focus.msg}` };
  } catch (e) {
    return falha(e);
  }
}

export async function reenviarCertificadoFocus(): Promise<FormState> {
  try {
    await requireAdmin();
    const cert = await db.query.certificadoDigital.findFirst();
    if (!cert) return { erro: "Nenhum certificado cadastrado." };
    const r = await enviarParaFocus(Buffer.from(decrypt(cert.arquivoEnc), "base64"), decrypt(cert.senhaEnc));
    revalidatePath("/configuracoes");
    return r.ok ? { ok: r.msg } : { erro: r.msg };
  } catch (e) {
    return falha(e);
  }
}

export async function removerCertificado() {
  await requireAdmin();
  await db.delete(certificadoDigital).where(eq(certificadoDigital.id, 1));
  revalidatePath("/", "layout");
}
