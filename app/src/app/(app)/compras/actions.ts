"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { fornecedores, itensNotaEntrada, notasEntrada } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cancelarNotaEntrada, importarXmlEntrada, lancarNotaEntrada } from "@/lib/compras";
import { isValidCnpj, isValidCpf } from "@/lib/documento";
import { onlyDigits, parseDecimal } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;
const str = z.string().trim();

// ---------- Fornecedores ----------
const FornecedorSchema = z.object({
  documento: str.transform(onlyDigits).refine((d) => (d.length === 11 && isValidCpf(d)) || (d.length === 14 && isValidCnpj(d)), "CPF/CNPJ inválido"),
  nome: str.min(2, "Informe o nome"),
  nomeFantasia: str.default(""),
  inscricaoEstadual: str.default(""),
  email: str.default(""),
  telefone: str.transform(onlyDigits).default(""),
  cidade: str.default(""),
  uf: str.max(2).default(""),
  observacoes: str.default(""),
});

export async function salvarFornecedor(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const p = FornecedorSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const valores = { ...p.data, tipo: p.data.documento.length === 14 ? ("PJ" as const) : ("PF" as const), uf: p.data.uf.toUpperCase() };
  try {
    if (id) await db.update(fornecedores).set({ ...valores, atualizadoEm: new Date() }).where(eq(fornecedores.id, id));
    else id = (await db.insert(fornecedores).values(valores).returning({ id: fornecedores.id }))[0]!.id;
  } catch (e) {
    return { erro: /fornecedores_documento/.test((e as Error).message) ? "Já existe um fornecedor com esse CPF/CNPJ." : (e as Error).message };
  }
  revalidatePath("/compras/fornecedores");
  redirect(`/compras/fornecedores/${id}?salvo=1`);
}

// ---------- Notas de entrada ----------
export async function importarXml(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const arq = form.get("xml");
  if (!(arq instanceof File) || !arq.size) return { erro: "Escolha o arquivo XML da NF-e." };
  if (arq.size > 5 * 1024 * 1024) return { erro: "Arquivo muito grande." };
  let id: number;
  try {
    id = await importarXmlEntrada(await arq.text());
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/compras/notas");
  redirect(`/compras/notas/${id}`);
}

const ItemSchema = z.object({
  descricao: str.min(1, "Descrição do item"),
  quantidade: z.number().positive(),
  valorUnitario: z.number().nonnegative(),
});
const NotaManualSchema = z.object({
  fornecedorId: z.uuid("Escolha o fornecedor"),
  numero: str.default(""),
  serie: str.default(""),
  emissao: str.default(""),
  frete: z.number().nonnegative(),
  desconto: z.number().nonnegative(),
  itens: z.array(ItemSchema).min(1, "Adicione ao menos um item"),
});

/** Nota sem XML (digitada); depois de criada, os itens são classificados na tela da nota. */
export async function criarNotaManual(entrada: z.input<typeof NotaManualSchema>): Promise<{ erro?: string }> {
  await requireUser();
  const p = NotaManualSchema.safeParse(entrada);
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const d = p.data;
  const produtosValor = d.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const total = Math.round((produtosValor + d.frete - d.desconto) * 100) / 100;
  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const [nota] = await tx
        .insert(notasEntrada)
        .values({
          fornecedorId: d.fornecedorId,
          numero: d.numero,
          serie: d.serie,
          emissao: d.emissao ? new Date(`${d.emissao}T12:00:00-03:00`) : null,
          valorProdutos: produtosValor,
          frete: d.frete,
          desconto: d.desconto,
          valorTotal: total,
          parcelas: [{ vencimento: d.emissao || new Date().toISOString().slice(0, 10), valor: total }],
        })
        .returning({ id: notasEntrada.id });
      await tx.insert(itensNotaEntrada).values(
        d.itens.map((i) => ({
          notaId: nota!.id,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: Math.round(i.quantidade * i.valorUnitario * 100) / 100,
          destino: /FILAMENTO|\b(PLA|PETG|ABS|ASA|TPU)\b/i.test(i.descricao) ? ("filamento" as const) : ("despesa" as const),
        })),
      );
      return nota!.id;
    });
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/compras/notas");
  redirect(`/compras/notas/${id}`);
}

/** Salva a classificação dos itens (destino, filamento/produto, gramas por unidade) e as parcelas. */
export async function salvarClassificacao(notaId: number, _: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const nota = await db.query.notasEntrada.findFirst({ where: eq(notasEntrada.id, notaId), with: { itens: true } });
  if (!nota) return { erro: "Nota não encontrada." };
  if (nota.status !== "rascunho") return { erro: "Nota já lançada: não dá para mudar a classificação." };
  const parcelas = form
    .getAll("parcelaVencimento")
    .map((v, i) => ({ vencimento: String(v), valor: parseDecimal(form.getAll("parcelaValor")[i]) }))
    .filter((p) => p.vencimento && p.valor > 0);
  await db.transaction(async (tx) => {
    for (const i of nota.itens) {
      const destino = String(form.get(`destino-${i.id}`) ?? i.destino) as "filamento" | "produto" | "despesa";
      await tx
        .update(itensNotaEntrada)
        .set({
          destino,
          filamentoId: destino === "filamento" ? Number(form.get(`filamento-${i.id}`)) || null : null,
          produtoId: destino === "produto" ? String(form.get(`produto-${i.id}`) || "") || null : null,
          gramasPorUnidade: Math.max(1, Math.round(Number(form.get(`gramas-${i.id}`)) || i.gramasPorUnidade)),
        })
        .where(eq(itensNotaEntrada.id, i.id));
    }
    if (parcelas.length) await tx.update(notasEntrada).set({ parcelas, atualizadoEm: new Date() }).where(eq(notasEntrada.id, notaId));
  });
  revalidatePath(`/compras/notas/${notaId}`);
  return { ok: "Classificação salva." };
}

export async function lancarNota(notaId: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const salvo = await salvarClassificacao(notaId, null, form);
  if (salvo?.erro) return salvo;
  try {
    await lancarNotaEntrada(notaId, user.sub);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/compras/notas");
  revalidatePath(`/compras/notas/${notaId}`);
  revalidatePath("/estoque", "layout");
  return { ok: "Nota lançada: filamentos e produtos entraram no estoque." };
}

export async function cancelarNota(notaId: number) {
  const user = await requireUser();
  await cancelarNotaEntrada(notaId, user.sub);
  revalidatePath("/compras/notas");
  revalidatePath(`/compras/notas/${notaId}`);
  revalidatePath("/estoque", "layout");
}
