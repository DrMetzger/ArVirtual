import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace, pedidosMarketplace } from "@/db/schema";
import { adapter, contaComToken } from "@/lib/marketplaces";

/** Visualizações e curtidas de todos os anúncios publicados (por conta, pela API de cada marketplace). */
export async function atualizarMetricas() {
  const contas = await db.select().from(contasMarketplace);
  let n = 0;
  for (const conta of contas) {
    const a = adapter(conta.marketplace);
    if (!a.metricas) continue;
    const lista = await db
      .select({ id: anuncios.id, idExterno: anuncios.idExterno })
      .from(anuncios)
      .where(and(eq(anuncios.contaId, conta.id), eq(anuncios.status, "publicado"), isNotNull(anuncios.idExterno)));
    if (!lista.length) continue;
    try {
      const m = await a.metricas(await contaComToken(conta), [...new Set(lista.map((l) => l.idExterno!))]);
      for (const l of lista) {
        const v = m[l.idExterno!];
        if (!v) continue;
        await db.update(anuncios).set({ visitas: v.visitas, curtidas: v.curtidas, metricasEm: new Date() }).where(eq(anuncios.id, l.id));
        n++;
      }
    } catch (e) {
      console.warn(`[metricas] ${conta.marketplace}: ${(e as Error).message}`);
    }
  }
  return n;
}

/**
 * Confere nos marketplaces se os anúncios vinculados ainda existem: excluído/encerrado vira "encerrado" (sai das
 * bandeiras e dos números), pausado vira "pausado" e, se voltar, "publicado". `produtoIds` limita a alguns produtos.
 */
export async function conferirAnuncios(produtoIds?: string[]) {
  const contas = await db.select().from(contasMarketplace);
  const mudou: { anuncio: number; de: string; para: string }[] = [];
  for (const conta of contas) {
    const a = adapter(conta.marketplace);
    if (!a.situacao) continue;
    const lista = await db
      .select({ id: anuncios.id, idExterno: anuncios.idExterno, status: anuncios.status })
      .from(anuncios)
      .where(
        and(
          eq(anuncios.contaId, conta.id),
          inArray(anuncios.status, ["publicado", "pausado", "encerrado"]),
          isNotNull(anuncios.idExterno),
          produtoIds?.length ? inArray(anuncios.produtoId, produtoIds) : undefined,
        ),
      );
    if (!lista.length) continue;
    try {
      const sit = await a.situacao(await contaComToken(conta), [...new Set(lista.map((l) => l.idExterno!))]);
      for (const l of lista) {
        const novo = sit[l.idExterno!];
        if (!novo || novo === l.status) continue;
        await db
          .update(anuncios)
          .set({ status: novo, mensagem: novo === "encerrado" ? "Não existe mais no marketplace (excluído ou encerrado)." : "", atualizadoEm: new Date() })
          .where(eq(anuncios.id, l.id));
        mudou.push({ anuncio: l.id, de: l.status, para: novo });
      }
    } catch (e) {
      console.warn(`[anuncios] ${conta.marketplace}: ${(e as Error).message}`);
    }
  }
  return mudou;
}

/** Taxas dos pedidos dos últimos 90 dias que ainda não estão fechadas (até `limite` por rodada). */
export async function atualizarTaxas(limite = 150) {
  const pendentes = await db
    .select({ id: pedidosMarketplace.id, contaId: pedidosMarketplace.contaId, idExterno: pedidosMarketplace.idExterno, dados: pedidosMarketplace.dados })
    .from(pedidosMarketplace)
    .where(and(eq(pedidosMarketplace.taxasFinal, false), isNotNull(pedidosMarketplace.contaId), gte(pedidosMarketplace.data, new Date(Date.now() - 90 * 86400_000))))
    .limit(limite);
  if (!pendentes.length) return 0;
  const contas = await db.select().from(contasMarketplace).where(inArray(contasMarketplace.id, [...new Set(pendentes.map((p) => p.contaId!))]));
  let n = 0;
  for (const conta of contas) {
    const a = adapter(conta.marketplace);
    if (!a.taxas) continue;
    const c = await contaComToken(conta).catch(() => null);
    if (!c) continue;
    for (const p of pendentes.filter((x) => x.contaId === conta.id)) {
      try {
        const t = await a.taxas(c, p.idExterno, p.dados);
        await db.update(pedidosMarketplace).set({ taxas: t.taxas, freteVendedor: t.freteVendedor, taxasFinal: t.final }).where(eq(pedidosMarketplace.id, p.id));
        n++;
      } catch (e) {
        console.warn(`[taxas] ${conta.marketplace} ${p.idExterno}: ${(e as Error).message}`);
      }
    }
  }
  return n;
}
