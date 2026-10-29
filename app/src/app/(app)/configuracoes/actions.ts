"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { aparelhos, certificadoDigital, contasEmail, empresa, notas, usuarios } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { esquecerBloqueio } from "@/lib/aparelhos";
import { encrypt } from "@/lib/crypto";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { certificateFromPfx } from "@/lib/nfe/sefaz";
import { isValidCnpj } from "@/lib/documento";
import { conferirCodigo, emailConfigurado, enviarCodigo } from "@/lib/dois-fatores";
import { lerFaixas } from "@/lib/precificacao";
import { getSetting, SETTINGS, setSetting, type SettingKey } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/uploads";
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

/** Logo do DANFE: PNG ou JPG até 1 MB. Devolve o nome do arquivo, "" para remover, undefined se nada mudou ou o erro. */
async function logoEnviado(form: FormData): Promise<string | undefined | { erro: string }> {
  if (form.get("removerLogo") === "on") return "";
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  const ext = ({ "image/png": "png", "image/jpeg": "jpg" } as Record<string, string>)[file.type];
  if (!ext) return { erro: "O logo precisa ser PNG ou JPG (o DANFE não aceita outros formatos)." };
  if (file.size > 1024 * 1024) return { erro: "O logo passa de 1 MB: reduza a imagem." };
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nome = `logo-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;
  await writeFile(`${UPLOAD_DIR}/${nome}`, Buffer.from(await file.arrayBuffer()));
  return nome;
}

export async function salvarEmpresa(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const parsed = EmpresaSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    const logo = await logoEnviado(form);
    if (typeof logo === "object") return logo;
    const dados = { ...parsed.data, ...(logo !== undefined ? { logoArquivo: logo } : {}) };
    await db.insert(empresa).values({ id: 1, ...dados }).onConflictDoUpdate({ target: empresa.id, set: dados });
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
    if (form.get("seguranca.exigir2fa") === "sim" && !(await emailConfigurado())) {
      return { erro: "Cadastre uma conta de e-mail padrão (aba E-mails) antes de exigir a verificação em duas etapas." };
    }
    for (const k of chaves) {
      const valor = String(form.get(k) ?? "").trim();
      if (k.endsWith(".faixas") && valor) lerFaixas(valor); // valida antes de salvar
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

export async function excluirContaEmail(id: number): Promise<FormState> {
  try {
    await requireAdmin();
    const restantes = await db.$count(contasEmail, ne(contasEmail.id, id));
    const em2fa = (await getSetting("seguranca.exigir2fa")) === "sim" || (await db.$count(usuarios, eq(usuarios.doisFatores, true))) > 0;
    if (restantes === 0 && em2fa) {
      return { erro: "Esta é a única conta de e-mail e a verificação em duas etapas está em uso: cadastre outra antes de excluir." };
    }
    await db.delete(contasEmail).where(eq(contasEmail.id, id));
    revalidatePath("/configuracoes");
    return { ok: "Conta de e-mail excluída." };
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

const EdicaoSchema = z.object({
  id: z.uuid(),
  nome: str.min(2, "Informe o nome"),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  papel: z.enum(["admin", "usuario"]),
});

/** Administrador edita o usuário e, se informar, define uma nova senha (ex.: quem esqueceu a senha). */
export async function editarUsuario(_: FormState, form: FormData): Promise<FormState> {
  try {
    const me = await requireAdmin();
    const parsed = EdicaoSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
    const { id, ...d } = parsed.data;
    const nova = String(form.get("novaSenha") ?? "");
    if (nova && nova.length < 10) return { erro: "A nova senha precisa ter ao menos 10 caracteres." };
    if (id === me.sub && d.papel !== "admin") return { erro: "Você não pode tirar o seu próprio acesso de administrador." };
    const outro = await db.query.usuarios.findFirst({ where: and(eq(usuarios.email, d.email), ne(usuarios.id, id)) });
    if (outro) return { erro: "Este e-mail já é de outro usuário." };
    await db
      .update(usuarios)
      .set({
        ...d,
        ...(nova ? { senhaHash: await bcrypt.hash(nova, 12) } : {}),
        ...(form.get("desligar2fa") === "on" ? { doisFatores: false } : {}),
      })
      .where(eq(usuarios.id, id));
    revalidatePath("/configuracoes");
    return { ok: nova ? `${d.nome}: dados salvos e senha redefinida. Passe a nova senha para a pessoa.` : `${d.nome}: dados salvos.` };
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

export async function removerCertificado() {
  await requireAdmin();
  await db.delete(certificadoDigital).where(eq(certificadoDigital.id, 1));
  revalidatePath("/", "layout");
}

// ---------- Verificação em duas etapas ----------
export async function iniciarAtivacao2fa(): Promise<FormState> {
  try {
    const me = await requireUser();
    if (!(await emailConfigurado())) return { erro: "Peça ao administrador para cadastrar uma conta de e-mail (aba E-mails) primeiro." };
    const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, me.sub) });
    if (!user) throw new Error("Usuário não encontrado.");
    await enviarCodigo(user, "ativar");
    return { ok: `Enviamos um código para ${user.email}. Digite-o abaixo para ativar.` };
  } catch (e) {
    return falha(e);
  }
}

export async function confirmarAtivacao2fa(_: FormState, form: FormData): Promise<FormState> {
  try {
    const me = await requireUser();
    const r = await conferirCodigo(me.sub, "ativar", String(form.get("codigo") ?? ""));
    if (!r.ok) return { erro: r.erro };
    await db.update(usuarios).set({ doisFatores: true }).where(eq(usuarios.id, me.sub));
    revalidatePath("/configuracoes");
    return { ok: "Verificação em duas etapas ativada: a partir de agora, o login pede o código enviado por e-mail." };
  } catch (e) {
    return falha(e);
  }
}

export async function desativar2fa(_: FormState, form: FormData): Promise<FormState> {
  try {
    const me = await requireUser();
    const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, me.sub) });
    if (!user || !(await bcrypt.compare(String(form.get("senha") ?? ""), user.senhaHash))) return { erro: "Senha incorreta." };
    await db.update(usuarios).set({ doisFatores: false }).where(eq(usuarios.id, me.sub));
    revalidatePath("/configuracoes");
    return { ok: "Verificação em duas etapas desativada." };
  } catch (e) {
    return falha(e);
  }
}

/** Bloqueia (ou libera) o celular: bloqueado, ele sai do sistema na hora e não entra mais, nem com a senha. */
export async function bloquearAparelho(id: string, bloquear: boolean) {
  const admin = await requireAdmin();
  await db
    .update(aparelhos)
    .set(bloquear ? { bloqueado: true, bloqueadoEm: new Date(), bloqueadoPor: admin.nome } : { bloqueado: false, bloqueadoEm: null, bloqueadoPor: "" })
    .where(eq(aparelhos.id, id));
  esquecerBloqueio(id);
  revalidatePath("/configuracoes");
}

/** Tira da lista (se o app abrir de novo, ele volta a aparecer; bloqueado não é removido para continuar barrado). */
export async function removerAparelho(id: string) {
  await requireAdmin();
  await db.delete(aparelhos).where(and(eq(aparelhos.id, id), eq(aparelhos.bloqueado, false)));
  esquecerBloqueio(id);
  revalidatePath("/configuracoes");
}
