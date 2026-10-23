"use server";

import bcrypt from "bcryptjs";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { certificadoDigital, contasEmail, empresa, notas, usuarios } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { statusSefaz } from "@/lib/nfe/emissor";
import { certificateFromPfx } from "@/lib/nfe/sefaz";
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

// ---------- Certificado digital A1 e emissão ----------
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
    // Confere se abre para assinar (mesmo caminho da emissão, aceita os A1 antigos em RC2/3DES).
    certificateFromPfx(arquivo.toString("base64"), senha);

    const valores = { arquivoEnc: encrypt(arquivo.toString("base64")), senhaEnc: encrypt(senha), nomeArquivo: file.name, ...info };
    await db.insert(certificadoDigital).values({ id: 1, ...valores }).onConflictDoUpdate({ target: certificadoDigital.id, set: valores });

    const emp = await db.query.empresa.findFirst();
    // A SEFAZ exige a mesma raiz (8 primeiros dígitos) do CNPJ do emitente (rejeição 213).
    const aviso =
      emp?.cnpj && info.cnpj && emp.cnpj.slice(0, 8) !== info.cnpj.slice(0, 8)
        ? ` Atenção: o CNPJ do certificado (${info.cnpj}) não é da empresa (${emp.cnpj}).`
        : "";
    revalidatePath("/", "layout");
    return { ok: `Certificado salvo e pronto para assinar as notas.${aviso}` };
  } catch (e) {
    return falha(e);
  }
}

const EmissaoSchema = z.object({
  ambienteNfe: z.enum(["homologacao", "producao"]),
  serieNfe: z.coerce.number().int().min(0).max(999),
  proximoNumeroNfe: z.coerce.number().int().min(1).max(999_999_999),
  aliquotaCreditoSn: z.string().trim(),
});

export async function salvarEmissao(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const parsed = EmissaoSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    const { aliquotaCreditoSn, ...d } = parsed.data;
    // Não deixa voltar a numeração para um número já usado na série.
    const [usado] = await db
      .select({ max: sql<number | null>`max(${notas.numero})` })
      .from(notas)
      .where(and(eq(notas.serie, d.serieNfe), isNotNull(notas.numero)));
    if (usado?.max && d.proximoNumeroNfe <= usado.max) {
      return { erro: `A série ${d.serieNfe} já usou até o número ${usado.max}: o próximo precisa ser maior.` };
    }
    const credito = aliquotaCreditoSn ? Number(aliquotaCreditoSn.replace(",", ".")) : null;
    await db
      .insert(empresa)
      .values({ id: 1, ...d, aliquotaCreditoSn: credito })
      .onConflictDoUpdate({ target: empresa.id, set: { ...d, aliquotaCreditoSn: credito } });
    revalidatePath("/configuracoes");
    return {
      ok: d.ambienteNfe === "producao" ? "Emissão em PRODUÇÃO: as notas têm valor fiscal." : "Emissão em homologação (testes, sem valor fiscal).",
    };
  } catch (e) {
    return falha(e);
  }
}

export async function testarSefaz(): Promise<FormState> {
  try {
    await requireAdmin();
    const r = await statusSefaz();
    const msg = `SEFAZ ${r.uf} (${r.ambiente === "producao" ? "produção" : "homologação"}): ${r.mensagem}`;
    return r.online ? { ok: msg } : { erro: msg };
  } catch (e) {
    return falha(e);
  }
}

export async function removerCertificado() {
  await requireAdmin();
  await db.delete(certificadoDigital).where(eq(certificadoDigital.id, 1));
  revalidatePath("/", "layout");
}
