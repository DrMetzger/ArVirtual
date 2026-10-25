import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { filamentos, movimentosFilamento, producoes, produtos } from "@/db/schema";
import { movimentar } from "@/lib/estoque";
import { round2 } from "@/lib/utils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Tipo = (typeof movimentosFilamento.$inferInsert)["tipo"];

/**
 * Movimenta o saldo de um filamento (gramas positivas entram, negativas saem) e registra no kardex.
 * Entrada com custo recalcula o custo médio ponderado do kg.
 */
export async function movimentarFilamento(
  tx: Tx,
  m: { filamentoId: number; gramas: number; tipo: Tipo; custoKg?: number; origem?: string; observacao?: string; usuarioId?: string | null },
) {
  if (!m.gramas) return;
  const atual = await tx.query.filamentos.findFirst({ where: eq(filamentos.id, m.filamentoId) });
  if (!atual) throw new Error("Filamento não encontrado.");
  let custoKg = atual.custoKg;
  if (m.gramas > 0 && m.custoKg && m.custoKg > 0) {
    const base = Math.max(0, atual.saldoG);
    custoKg = round2((base * atual.custoKg + m.gramas * m.custoKg) / (base + m.gramas));
  }
  const [f] = await tx
    .update(filamentos)
    .set({ saldoG: sql`${filamentos.saldoG} + ${m.gramas}`, custoKg, atualizadoEm: new Date() })
    .where(eq(filamentos.id, m.filamentoId))
    .returning({ saldoG: filamentos.saldoG });
  await tx.insert(movimentosFilamento).values({
    filamentoId: m.filamentoId,
    tipo: m.tipo,
    gramas: m.gramas,
    saldoG: f!.saldoG,
    custoKg: m.custoKg ?? 0,
    origem: m.origem ?? "",
    observacao: m.observacao ?? "",
    usuarioId: m.usuarioId ?? null,
  });
}

/** Produção concluída: as peças entram no estoque e o filamento (peças × gramas + perdas) sai. */
export async function registrarProducao(p: {
  produtoId: string;
  quantidade: number;
  filamentoId?: number | null;
  perdaG?: number;
  observacao?: string;
  usuarioId: string;
}) {
  return db.transaction(async (tx) => {
    const produto = await tx.query.produtos.findFirst({ where: eq(produtos.id, p.produtoId) });
    if (!produto) throw new Error("Produto não encontrado.");
    const filamentoId = p.filamentoId ?? produto.filamentoId ?? null;
    const gramas = produto.filamentoG * p.quantidade;
    const perda = Math.max(0, p.perdaG ?? 0);
    const [prod] = await tx
      .insert(producoes)
      .values({
        produtoId: produto.id,
        filamentoId,
        quantidade: p.quantidade,
        gramas,
        perdaG: perda,
        tempoMin: produto.tempoImpressaoMin * p.quantidade,
        observacao: p.observacao ?? "",
        usuarioId: p.usuarioId,
      })
      .returning({ id: producoes.id });
    const origem = `producao:${prod!.id}`;
    await movimentar(tx, { produtoId: produto.id, quantidade: p.quantidade, tipo: "producao", origem, observacao: `Produção de ${p.quantidade}`, usuarioId: p.usuarioId });
    if (filamentoId && gramas + perda > 0) {
      await movimentarFilamento(tx, {
        filamentoId,
        gramas: -(gramas + perda),
        tipo: "consumo",
        origem,
        observacao: `${produto.nome} × ${p.quantidade}${perda ? ` (+${perda} g de perda)` : ""}`,
        usuarioId: p.usuarioId,
      });
    }
    return prod!.id;
  });
}

/** Filamentos ativos para escolher no produto e na produção. */
export function listaFilamentos() {
  return db
    .select({ id: filamentos.id, material: filamentos.material, cor: filamentos.cor, marca: filamentos.marca, custoKg: filamentos.custoKg, saldoG: filamentos.saldoG, corHex: filamentos.corHex })
    .from(filamentos)
    .where(eq(filamentos.ativo, true))
    .orderBy(filamentos.material, filamentos.cor);
}

/** Quantas peças de cada produto ainda dá para imprimir com o saldo do filamento ligado a ele. */
export async function capacidadeProducao() {
  const [lista, fils] = await Promise.all([
    db
      .select({
        id: produtos.id,
        sku: produtos.sku,
        nome: produtos.nome,
        filamentoG: produtos.filamentoG,
        tempoMin: produtos.tempoImpressaoMin,
        filamentoId: produtos.filamentoId,
        estoque: produtos.estoque,
      })
      .from(produtos)
      .where(eq(produtos.ativo, true)),
    db.select().from(filamentos),
  ]);
  return lista
    .map((p) => {
      const f = fils.find((x) => x.id === p.filamentoId);
      const pecas = f && p.filamentoG > 0 ? Math.max(0, Math.floor(f.saldoG / p.filamentoG)) : null;
      return { ...p, filamento: f ?? null, pecas, horas: pecas !== null ? (pecas * p.tempoMin) / 60 : null };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
