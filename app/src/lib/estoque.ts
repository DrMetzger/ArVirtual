import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { movimentosEstoque, pedidosMarketplace, produtos, type PedidoMarketplace } from "@/db/schema";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import { vincularItens } from "@/lib/pedidos";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Tipo = (typeof movimentosEstoque.$inferInsert)["tipo"];

/** Movimenta o estoque de um produto (quantidade positiva entra, negativa sai) e registra no kardex. */
export async function movimentar(
  tx: Tx,
  m: { produtoId: string; quantidade: number; tipo: Tipo; origem?: string; observacao?: string; usuarioId?: string | null },
) {
  if (!m.quantidade) return;
  const [p] = await tx
    .update(produtos)
    .set({ estoque: sql`${produtos.estoque} + ${m.quantidade}` })
    .where(eq(produtos.id, m.produtoId))
    .returning({ estoque: produtos.estoque });
  if (!p) throw new Error("Produto não encontrado.");
  await tx.insert(movimentosEstoque).values({
    produtoId: m.produtoId,
    tipo: m.tipo,
    quantidade: m.quantidade,
    saldo: p.estoque,
    origem: m.origem ?? "",
    observacao: m.observacao ?? "",
    usuarioId: m.usuarioId ?? null,
  });
}

/** Ajuste de inventário: leva o saldo para `saldo` (contagem física). */
export async function ajustarPara(produtoId: string, saldo: number, observacao: string, usuarioId: string) {
  await db.transaction(async (tx) => {
    const p = await tx.query.produtos.findFirst({ where: eq(produtos.id, produtoId), columns: { estoque: true } });
    if (!p) throw new Error("Produto não encontrado.");
    await movimentar(tx, { produtoId, quantidade: saldo - p.estoque, tipo: "ajuste", observacao: observacao || "Contagem de estoque", usuarioId });
  });
}

/**
 * Venda sai do estoque quando o pedido está pago (ou enviado/entregue) e volta se for cancelado.
 * Só itens ligados a um produto do cadastro movimentam. Idempotente: usa a marca `estoqueBaixado`.
 */
export async function atualizarEstoqueDoPedido(pedido: PedidoMarketplace) {
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const vendido = situacao === "pago" || situacao === "enviado" || situacao === "entregue";
  const cancelado = situacao === "cancelado";
  if ((vendido && pedido.estoqueBaixado) || (!vendido && !pedido.estoqueBaixado) || (!vendido && !cancelado)) return;

  const itens = await vincularItens(pedido);
  const sinal = vendido ? -1 : 1;
  await db.transaction(async (tx) => {
    // Trava o pedido: duas sincronizações ao mesmo tempo não baixam duas vezes.
    const [atual] = await tx
      .update(pedidosMarketplace)
      .set({ estoqueBaixado: vendido })
      .where(sql`${pedidosMarketplace.id} = ${pedido.id} and ${pedidosMarketplace.estoqueBaixado} = ${!vendido}`)
      .returning({ id: pedidosMarketplace.id });
    if (!atual) return;
    for (const i of itens) {
      if (!i.produto) continue;
      await movimentar(tx, {
        produtoId: i.produto.id,
        quantidade: sinal * i.quantidade,
        tipo: vendido ? "venda" : "estorno",
        origem: `pedido:${pedido.id}`,
        observacao: `${vendido ? "Venda" : "Cancelamento"} ${pedido.idExterno}`,
      });
    }
  });
}
