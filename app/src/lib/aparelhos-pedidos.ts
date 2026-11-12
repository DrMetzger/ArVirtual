import "server-only";
import { EventEmitter } from "node:events";
import { and, desc, gt, gte } from "drizzle-orm";
import { db } from "@/db";
import { pedidosMarketplace } from "@/db/schema";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import { formatBRL } from "@/lib/utils";

/** Avisa quem está esperando (celulares conectados) que a sincronização acabou de gravar pedidos. */
const g = globalThis as unknown as { avisosPedidos?: EventEmitter };
export const avisosPedidos = (g.avisosPedidos ??= new EventEmitter().setMaxListeners(200));

/**
 * Pedidos que entraram no ERP depois de `desde` (para a notificação no celular). Só compras recentes:
 * o histórico importado ao conectar uma conta não vira enxurrada de avisos.
 */
export async function pedidosNovos(desde: Date) {
  const lista = await db
    .select({
      id: pedidosMarketplace.id,
      marketplace: pedidosMarketplace.marketplace,
      idExterno: pedidosMarketplace.idExterno,
      total: pedidosMarketplace.total,
      comprador: pedidosMarketplace.comprador,
      itens: pedidosMarketplace.itens,
      status: pedidosMarketplace.status,
    })
    .from(pedidosMarketplace)
    .where(
      and(
        gt(pedidosMarketplace.criadoEm, desde),
        gte(pedidosMarketplace.data, new Date(Date.now() - 2 * 86400_000)),
      ),
    )
    .orderBy(desc(pedidosMarketplace.criadoEm))
    .limit(20);
  return lista.filter((p) => situacaoPedido(p.marketplace, p.status) !== "cancelado").map((p) => {
    const canal = p.marketplace === "loja" ? "Loja própria" : (MARKETPLACE_INFO[p.marketplace as keyof typeof MARKETPLACE_INFO]?.nome ?? p.marketplace);
    const item = p.itens[0];
    const mais = p.itens.length > 1 ? ` + ${p.itens.length - 1} item(ns)` : "";
    return {
      id: p.id,
      titulo: `Novo pedido ${canal} · ${formatBRL(p.total)}`,
      texto: `${item ? `${item.quantidade}× ${item.titulo}${mais}` : "Pedido"}${p.comprador ? ` · ${p.comprador}` : ""}`,
      link: `/pedidos/${p.id}`,
    };
  });
}
