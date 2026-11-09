import "server-only";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, empresa, notas, pedidosMarketplace } from "@/db/schema";
import { adapter, contaComToken } from "./index";

/**
 * Manda ao marketplace a NF-e autorizada do pedido (hoje: Magalu; ML e Shopee são de pessoa física, sem nota).
 * Grava o resultado em notas.envioMarketplace: "enviada" ou o motivo da falha (tenta de novo na sincronização).
 */
export async function enviarNotaAoMarketplace(notaId: string) {
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, notaId) });
  if (!nota || nota.status !== "autorizada" || !nota.chave || !nota.xmlProc) return null;
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.notaId, notaId) });
  if (!pedido || !pedido.contaId) return null;
  const a = adapter(pedido.marketplace);
  if (!a.enviarNota) return null;
  let resultado: string;
  try {
    const conta = await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId) });
    if (!conta) throw new Error("A conta do marketplace deste pedido foi desconectada.");
    const emp = await db.query.empresa.findFirst({ columns: { cnpj: true } });
    await a.enviarNota(await contaComToken(conta), pedido.dados, {
      chave: nota.chave,
      xml: nota.xmlProc,
      valor: nota.totalNota,
      emitidaEm: nota.emitidaEm ?? nota.autorizadaEm ?? new Date(),
      cnpjEmitente: emp?.cnpj ?? "",
    });
    resultado = "enviada";
  } catch (e) {
    resultado = (e as Error).message.slice(0, 500) || "Falha ao enviar a nota.";
  }
  await db.update(notas).set({ envioMarketplace: resultado }).where(eq(notas.id, notaId));
  return resultado;
}

/** Notas autorizadas de pedidos que ainda não chegaram ao marketplace (falhou antes): tenta de novo. */
export async function reenviarNotasPendentes() {
  const pendentes = await db
    .select({ id: notas.id })
    .from(notas)
    .innerJoin(pedidosMarketplace, eq(pedidosMarketplace.notaId, notas.id))
    .where(and(eq(notas.status, "autorizada"), isNotNull(notas.xmlProc), ne(notas.envioMarketplace, "enviada"), inArray(pedidosMarketplace.marketplace, ["magalu"])))
    .limit(20);
  for (const p of pendentes) await enviarNotaAoMarketplace(p.id);
  return pendentes.length;
}
