import "server-only";
import { and, eq, sql } from "drizzle-orm";
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

/** Filamentos da peça; produto antigo (sem composição) usa o filamento e as gramas do cadastro. */
export function composicaoDo(p: { composicao: { filamentoId: number | null; gramas: number }[]; filamentoId: number | null; filamentoG: number }) {
  return p.composicao.length ? p.composicao : p.filamentoId || p.filamentoG ? [{ filamentoId: p.filamentoId, gramas: p.filamentoG }] : [];
}

/**
 * Produção concluída: as peças entram no estoque e sai cada filamento da peça (peças × gramas).
 * `filamentoId` (opcional) troca o 1º filamento; a perda (falhas, purga) sai do 1º filamento.
 */
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
    if (produto.temVariacoes) throw new Error("Escolha a variação (cor) que foi produzida.");
    const comp = composicaoDo(produto).map((c, i) => (i === 0 && p.filamentoId ? { ...c, filamentoId: p.filamentoId } : c));
    const gramas = comp.reduce((s, c) => s + c.gramas, 0) * p.quantidade;
    const perda = Math.max(0, p.perdaG ?? 0);
    const [prod] = await tx
      .insert(producoes)
      .values({
        produtoId: produto.id,
        filamentoId: comp[0]?.filamentoId ?? null,
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
    for (const [i, c] of comp.entries()) {
      const usado = c.gramas * p.quantidade + (i === 0 ? perda : 0);
      if (!c.filamentoId || usado <= 0) continue;
      await movimentarFilamento(tx, {
        filamentoId: c.filamentoId,
        gramas: -usado,
        tipo: "consumo",
        origem,
        observacao: `${produto.nome} × ${p.quantidade}${i === 0 && perda ? ` (+${perda} g de perda)` : ""}${comp.length > 1 ? ` · filamento ${i + 1} de ${comp.length}` : ""}`,
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

/** Quantas peças de cada produto ainda dá para imprimir: o filamento que acabar primeiro limita (peças multicor). */
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
        composicao: produtos.composicao,
        estoque: produtos.estoque,
      })
      .from(produtos)
      .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false))),
    db.select().from(filamentos),
  ]);
  return lista
    .map((p) => {
      const comp = composicaoDo(p)
        .map((c) => ({ ...c, filamento: fils.find((x) => x.id === c.filamentoId) ?? null }))
        .filter((c) => c.filamento && c.gramas > 0);
      const pecas = comp.length ? Math.max(0, Math.min(...comp.map((c) => Math.floor(c.filamento!.saldoG / c.gramas)))) : null;
      return {
        ...p,
        filamento: comp[0]?.filamento ?? null,
        filamentos: comp.map((c) => ({ ...c.filamento!, gramas: c.gramas })),
        pecas,
        horas: pecas !== null ? (pecas * p.tempoMin) / 60 : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
