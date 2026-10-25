"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { contasCaixa, lancamentos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dia } from "@/lib/financeiro";
import { parseDecimal } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;
const atualizar = () => revalidatePath("/financeiro", "layout");

/** Baixa (recebimento ou pagamento) de um título. */
export async function baixar(id: number, _: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const data = String(form.get("data") || "");
  const valor = parseDecimal(form.get("valor"));
  const conta = Number(form.get("conta")) || null;
  if (!data || valor <= 0) return { erro: "Informe a data e o valor." };
  const [l] = await db
    .update(lancamentos)
    .set({ status: "pago", pagoEm: dia(data), valorPago: valor, contaCaixaId: conta, formaPagamento: String(form.get("forma") ?? ""), atualizadoEm: new Date() })
    .where(and(eq(lancamentos.id, id), eq(lancamentos.status, "aberto")))
    .returning({ id: lancamentos.id });
  if (!l) return { erro: "Título não está em aberto." };
  atualizar();
  return { ok: "Baixado." };
}

export async function estornarBaixa(id: number) {
  await requireUser();
  await db
    .update(lancamentos)
    .set({ status: "aberto", pagoEm: null, valorPago: null, contaCaixaId: null, formaPagamento: "", atualizadoEm: new Date() })
    .where(and(eq(lancamentos.id, id), eq(lancamentos.status, "pago")));
  atualizar();
}

export async function cancelarLancamento(id: number) {
  await requireUser();
  await db.update(lancamentos).set({ status: "cancelado", atualizadoEm: new Date() }).where(and(eq(lancamentos.id, id), eq(lancamentos.status, "aberto")));
  atualizar();
}

export async function reabrirLancamento(id: number) {
  await requireUser();
  await db.update(lancamentos).set({ status: "aberto", atualizadoEm: new Date() }).where(and(eq(lancamentos.id, id), eq(lancamentos.status, "cancelado")));
  atualizar();
}

const LancSchema = z.object({
  tipo: z.enum(["receber", "pagar"]),
  descricao: z.string().trim().min(2, "Descreva o lançamento"),
  categoria: z.string().trim().max(60),
  valor: z.number().positive("Informe o valor"),
  vencimento: z.string().min(10, "Informe o vencimento"),
  parcelas: z.number().int().min(1).max(60),
  observacoes: z.string().trim().max(1000),
});

/** Lançamento manual (aluguel, energia, venda avulsa...). Com parcelas, repete mês a mês. Pode já entrar baixado. */
export async function criarLancamento(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const p = LancSchema.safeParse({
    tipo: form.get("tipo"),
    descricao: form.get("descricao"),
    categoria: form.get("categoria") ?? "",
    valor: parseDecimal(form.get("valor")),
    vencimento: form.get("vencimento"),
    parcelas: Number(form.get("parcelas") || 1),
    observacoes: form.get("observacoes") ?? "",
  });
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const d = p.data;
  const pago = form.get("pago") === "on";
  const conta = Number(form.get("conta")) || null;
  const base = dia(d.vencimento);
  await db.insert(lancamentos).values(
    Array.from({ length: d.parcelas }, (_, i) => {
      const venc = new Date(base);
      venc.setMonth(venc.getMonth() + i);
      return {
        tipo: d.tipo,
        descricao: d.descricao,
        categoria: d.categoria,
        valor: d.valor,
        vencimento: venc,
        parcela: d.parcelas > 1 ? `${i + 1}/${d.parcelas}` : "",
        observacoes: d.observacoes,
        ...(pago && i === 0 ? { status: "pago" as const, pagoEm: venc, valorPago: d.valor, contaCaixaId: conta } : {}),
      };
    }),
  );
  atualizar();
  redirect(`/financeiro/${d.tipo}`);
}

export async function salvarConta(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const nome = String(form.get("nome") ?? "").trim();
  if (nome.length < 2) return { erro: "Dê um nome para a conta." };
  const valores = { nome, saldoInicial: parseDecimal(form.get("saldoInicial")), ativo: id ? form.get("ativo") === "on" : true };
  if (id) await db.update(contasCaixa).set({ ...valores, atualizadoEm: new Date() }).where(eq(contasCaixa.id, id));
  else await db.insert(contasCaixa).values(valores);
  atualizar();
  return { ok: "Conta salva." };
}
