"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { clientes, enderecos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { tipoDocumento } from "@/lib/documento";
import { onlyDigits } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;

const str = z.string().trim();
const ClienteSchema = z.object({
  id: str.optional(),
  documento: str.min(11, "Informe o CPF ou CNPJ"),
  nome: str.min(2, "Informe o nome / razão social"),
  nomeFantasia: str.default(""),
  inscricaoEstadual: str.default(""),
  indicadorIe: z.coerce.number().int().refine((v) => [1, 2, 9].includes(v)),
  email: z.union([z.literal(""), z.email("E-mail inválido")]).default(""),
  telefone: str.default(""),
  situacaoCadastral: str.default(""),
  observacoes: str.default(""),
  dadosReceita: str.default(""),
});

const EnderecoSchema = z.object({
  apelido: str.min(1).default("Principal"),
  cep: str.transform(onlyDigits).pipe(z.string().length(8, "CEP deve ter 8 dígitos")),
  logradouro: str.min(1, "Informe o logradouro"),
  numero: str.min(1, "Informe o número (ou S/N)"),
  complemento: str.default(""),
  bairro: str.min(1, "Informe o bairro"),
  cidade: str.min(1, "Informe a cidade"),
  uf: str.length(2),
  codigoIbge: str.transform(onlyDigits).default(""),
});

const entries = (form: FormData) =>
  Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

export async function salvarCliente(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = ClienteSchema.safeParse(entries(form));
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const { id, dadosReceita, ...d } = parsed.data;

  const documento = onlyDigits(d.documento);
  const tipo = tipoDocumento(documento);
  if (!tipo) return { erro: "CPF/CNPJ inválido." };
  if (d.indicadorIe === 1 && !d.inscricaoEstadual) return { erro: "Contribuinte de ICMS precisa da Inscrição Estadual." };

  const dup = await db.query.clientes.findFirst({
    where: id ? and(eq(clientes.documento, documento), ne(clientes.id, id)) : eq(clientes.documento, documento),
  });
  if (dup) return { erro: `Já existe cliente com este documento: ${dup.nome}.` };

  const valores = {
    ...d,
    tipo,
    documento,
    telefone: onlyDigits(d.telefone),
    ...(dadosReceita ? { dadosReceita: JSON.parse(dadosReceita) as object } : {}),
  };

  let clienteId = id;
  if (id) {
    await db.update(clientes).set(valores).where(eq(clientes.id, id));
  } else {
    const endereco = form.get("cep") ? EnderecoSchema.safeParse(entries(form)) : null;
    if (endereco && !endereco.success) return { erro: endereco.error.issues[0]?.message ?? "Endereço inválido" };
    clienteId = await db.transaction(async (tx) => {
      const [novo] = await tx.insert(clientes).values(valores).returning({ id: clientes.id });
      if (endereco?.success) await tx.insert(enderecos).values({ ...endereco.data, clienteId: novo!.id, principal: true });
      return novo!.id;
    });
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${clienteId}?salvo=1`);
}

export async function excluirCliente(id: string) {
  await requireUser();
  try {
    await db.delete(clientes).where(eq(clientes.id, id));
  } catch {
    redirect(`/clientes/${id}?erro=${encodeURIComponent("Cliente com notas fiscais não pode ser excluído.")}`);
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function salvarEndereco(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const clienteId = String(form.get("clienteId"));
  const enderecoId = String(form.get("enderecoId") ?? "");
  const parsed = EnderecoSchema.safeParse(entries(form));
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Endereço inválido" };

  if (enderecoId) {
    await db.update(enderecos).set(parsed.data).where(and(eq(enderecos.id, enderecoId), eq(enderecos.clienteId, clienteId)));
  } else {
    const existentes = await db.$count(enderecos, eq(enderecos.clienteId, clienteId));
    await db.insert(enderecos).values({ ...parsed.data, clienteId, principal: existentes === 0 });
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Endereço salvo." };
}

export async function excluirEndereco(clienteId: string, enderecoId: string) {
  await requireUser();
  await db.delete(enderecos).where(and(eq(enderecos.id, enderecoId), eq(enderecos.clienteId, clienteId)));
  revalidatePath(`/clientes/${clienteId}`);
}

export async function tornarPrincipal(clienteId: string, enderecoId: string) {
  await requireUser();
  await db.transaction(async (tx) => {
    await tx.update(enderecos).set({ principal: false }).where(eq(enderecos.clienteId, clienteId));
    await tx.update(enderecos).set({ principal: true }).where(and(eq(enderecos.id, enderecoId), eq(enderecos.clienteId, clienteId)));
  });
  revalidatePath(`/clientes/${clienteId}`);
}
