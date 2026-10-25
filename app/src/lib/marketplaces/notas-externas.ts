import "server-only";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, notasExternas, pedidosMarketplace, type PedidoMarketplace } from "@/db/schema";
import { situacaoPedido } from "./situacao";
import type { ContaComToken, MarketplaceAdapter } from "./types";

const tag = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1] ?? "";

/** Chaves (e status) que o pedido já traz na listagem do marketplace, quando traz. */
function chavesNoPedido(dados: unknown) {
  const entregas = (dados as { deliveries?: { invoices?: { key?: string; status?: string | { id?: string } }[] }[] })?.deliveries ?? [];
  return entregas.flatMap((d) => d.invoices ?? []).filter((n) => n.key);
}

/** Vale a pena consultar o marketplace? Pedido faturado/enviado sem a nota salva, ou nota com status novo. */
export async function precisaBuscarNotas(pedido: PedidoMarketplace) {
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const salvas = await db.select({ chave: notasExternas.chave, status: notasExternas.status }).from(notasExternas).where(eq(notasExternas.pedidoId, pedido.id));
  const listadas = chavesNoPedido(pedido.dados);
  if (listadas.length) {
    return listadas.some((n) => {
      const s = salvas.find((x) => x.chave === n.key!.replace(/\D/g, ""));
      const status = typeof n.status === "string" ? n.status : (n.status?.id ?? "");
      return !s || (status && s.status !== status);
    });
  }
  return !salvas.length && (situacao === "enviado" || situacao === "entregue" || pedido.status === "invoiced");
}

/** Busca no marketplace as NF-e informadas para o pedido e grava (chave, número, valor e XML). */
export async function importarNotasDoPedido(a: MarketplaceAdapter, conta: ContaComToken, pedido: PedidoMarketplace) {
  if (!a.notasDoPedido) return 0;
  const notas = await a.notasDoPedido(conta, pedido.dados);
  for (const n of notas) {
    if (n.chave.length !== 44) continue;
    const xml = n.xml;
    const valores = {
      // Número, série e CNPJ estão na própria chave; o XML confirma e traz o valor.
      numero: Number(tag(xml, "nNF")) || Number(n.chave.slice(25, 34)),
      serie: Number(tag(xml, "serie")) || Number(n.chave.slice(22, 25)),
      cnpjEmitente: tag(xml, "CNPJ") || n.chave.slice(6, 20),
      emitidaEm: tag(xml, "dhEmi") ? new Date(tag(xml, "dhEmi")) : n.emitidaEm,
      valor: Number(tag(xml, "vNF")) || 0,
      status: n.status,
      ...(xml ? { xml } : {}),
    };
    await db
      .insert(notasExternas)
      .values({ pedidoId: pedido.id, origem: a.id, chave: n.chave, ...valores })
      .onConflictDoUpdate({ target: notasExternas.chave, set: { pedidoId: pedido.id, ...valores, atualizadoEm: new Date() } });
  }
  return notas.length;
}

/** Botão "Buscar notas": todos os pedidos já faturados do marketplace que ainda não têm a nota salva. */
export async function buscarNotasPendentes(contaComToken: (c: typeof contasMarketplace.$inferSelect) => Promise<ContaComToken>, adapter: (id: string) => MarketplaceAdapter) {
  const contas = await db.select().from(contasMarketplace);
  let pedidos = 0;
  let notas = 0;
  const erros: string[] = [];
  for (const conta of contas) {
    const a = adapter(conta.marketplace);
    if (!a.notasDoPedido) continue;
    const lista = await db
      .select()
      .from(pedidosMarketplace)
      .where(
        and(
          eq(pedidosMarketplace.contaId, conta.id),
          notExists(db.select().from(notasExternas).where(eq(notasExternas.pedidoId, pedidosMarketplace.id))),
        ),
      );
    const alvo = lista.filter((p) => ["pago", "enviado", "entregue"].includes(situacaoPedido(p.marketplace, p.status)));
    if (!alvo.length) continue;
    const token = await contaComToken(conta);
    for (const p of alvo) {
      try {
        notas += await importarNotasDoPedido(a, token, p);
        pedidos++;
      } catch (e) {
        erros.push(`${p.idExterno}: ${(e as Error).message}`);
      }
    }
  }
  return { pedidos, notas, erros };
}

export const notasDosPedidos = (ids: number[]) =>
  ids.length ? db.select().from(notasExternas).where(inArray(notasExternas.pedidoId, ids)) : Promise.resolve([]);
