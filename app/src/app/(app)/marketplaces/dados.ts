import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace, MARKETPLACES, pedidosMarketplace, produtos, type Marketplace } from "@/db/schema";
import { statusDaSituacao } from "@/lib/marketplaces/situacao";

export type Resumo = { marketplace: Marketplace; pedidos: number; vendido: number; taxas: number; frete: number; abertos: number; visitas: number; curtidas: number };

/** Últimos 30 dias por marketplace (sem cancelados): vendido, taxas, frete pago e visualizações dos anúncios no ar. */
export async function resumoMarketplaces(): Promise<Resumo[]> {
  const cancelados = statusDaSituacao("cancelado");
  const naoCancelado = cancelados.length
    ? sql`not (${sql.join(cancelados.map((c) => sql`(${pedidosMarketplace.marketplace} = ${c.marketplace} and ${pedidosMarketplace.status} = ${c.status})`), sql` or `)})`
    : sql`true`;
  const [vendas, vistas] = await Promise.all([
    db
      .select({
        marketplace: pedidosMarketplace.marketplace,
        pedidos: sql<number>`count(*)::int`,
        vendido: sql<number>`coalesce(sum(${pedidosMarketplace.total}), 0)::float`,
        taxas: sql<number>`coalesce(sum(${pedidosMarketplace.taxas}), 0)::float`,
        frete: sql<number>`coalesce(sum(${pedidosMarketplace.freteVendedor}), 0)::float`,
        abertos: sql<number>`count(*) filter (where not ${pedidosMarketplace.taxasFinal})::int`,
      })
      .from(pedidosMarketplace)
      .where(and(gte(pedidosMarketplace.data, new Date(Date.now() - 30 * 86400_000)), naoCancelado))
      .groupBy(pedidosMarketplace.marketplace),
    db
      .select({ marketplace: anuncios.marketplace, visitas: sql<number>`coalesce(sum(${anuncios.visitas}), 0)::int`, curtidas: sql<number>`coalesce(sum(${anuncios.curtidas}), 0)::int` })
      .from(anuncios)
      .where(eq(anuncios.status, "publicado"))
      .groupBy(anuncios.marketplace),
  ]);
  return ([...MARKETPLACES] as Marketplace[]).map((m) => {
    const v = vendas.find((x) => x.marketplace === m);
    const a = vistas.find((x) => x.marketplace === m);
    return { marketplace: m, pedidos: v?.pedidos ?? 0, vendido: v?.vendido ?? 0, taxas: v?.taxas ?? 0, frete: v?.frete ?? 0, abertos: v?.abertos ?? 0, visitas: a?.visitas ?? 0, curtidas: a?.curtidas ?? 0 };
  });
}

/** Pedidos mais recentes (de um marketplace ou de todos). */
export function pedidosRecentes(marketplace?: Marketplace, limite = 10) {
  return db
    .select({
      id: pedidosMarketplace.id,
      marketplace: pedidosMarketplace.marketplace,
      idExterno: pedidosMarketplace.idExterno,
      status: pedidosMarketplace.status,
      total: pedidosMarketplace.total,
      taxas: pedidosMarketplace.taxas,
      comprador: pedidosMarketplace.comprador,
      data: pedidosMarketplace.data,
      conta: contasMarketplace.nome,
    })
    .from(pedidosMarketplace)
    .innerJoin(contasMarketplace, eq(contasMarketplace.id, pedidosMarketplace.contaId))
    .where(marketplace ? eq(pedidosMarketplace.marketplace, marketplace) : undefined)
    .orderBy(desc(pedidosMarketplace.data))
    .limit(limite);
}

/** Anúncios do ERP num marketplace, com o produto, visualizações e situação (mais vistos primeiro). */
export function anunciosDoMarketplace(marketplace: Marketplace) {
  return db
    .select({
      id: anuncios.id,
      idExterno: anuncios.idExterno,
      link: anuncios.link,
      status: anuncios.status,
      preco: anuncios.preco,
      visitas: anuncios.visitas,
      curtidas: anuncios.curtidas,
      metricasEm: anuncios.metricasEm,
      mensagem: anuncios.mensagem,
      conta: contasMarketplace.nome,
      produtoId: produtos.id,
      paiId: produtos.paiId,
      sku: produtos.sku,
      nome: produtos.nome,
      imagem: sql<string | null>`${produtos.imagens}[1]`,
    })
    .from(anuncios)
    .innerJoin(produtos, eq(produtos.id, anuncios.produtoId))
    .innerJoin(contasMarketplace, eq(contasMarketplace.id, anuncios.contaId))
    .where(eq(anuncios.marketplace, marketplace))
    .orderBy(sql`case ${anuncios.status} when 'publicado' then 0 when 'pausado' then 1 when 'encerrado' then 2 else 3 end`, desc(anuncios.visitas));
}
