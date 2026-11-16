import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contasCaixa, lancamentos, pedidosMarketplace, type NotaEntrada, type PedidoMarketplace } from "@/db/schema";
import { CANAIS } from "@/components/marca";
import { numeroPedido, situacaoPedido } from "@/lib/marketplaces/situacao";
import { getSettings } from "@/lib/settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Data (AAAA-MM-DD) ao meio-dia de Brasília, para vencimentos não mudarem de dia com o fuso. */
export const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00-03:00`);
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Prazo (dias) até o marketplace liberar o dinheiro da venda; Configurações › Precificação. */
async function prazoRecebimento(canal: PedidoMarketplace["marketplace"]) {
  if (canal === "loja") return 0;
  const s = await getSettings(["mercadolivre.prazo", "shopee.prazo", "magalu.prazo", "tiktok.prazo"]);
  const padrao = { mercadolivre: 30, shopee: 15, magalu: 30, tiktok: 15 }[canal];
  const v = Number(s[`${canal}.prazo`]);
  return s[`${canal}.prazo`] && Number.isFinite(v) ? v : padrao;
}

async function contaPadrao(tx: Tx) {
  return (await tx.query.contasCaixa.findFirst({ where: eq(contasCaixa.ativo, true), orderBy: asc(contasCaixa.id) }))?.id ?? null;
}

/**
 * Venda paga gera o título a receber (uma vez). Marketplace: aberto até a data prevista do repasse.
 * Loja própria: já entra recebido no caixa. Pedido cancelado cancela o título que ainda estiver aberto.
 */
export async function atualizarFinanceiroDoPedido(pedido: PedidoMarketplace) {
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const vendido = situacao === "pago" || situacao === "enviado" || situacao === "entregue";
  const origem = `pedido:${pedido.id}`;

  if (situacao === "cancelado" && pedido.financeiroGerado) {
    // Venda cancelada: o título sai do financeiro, inclusive o já recebido (loja própria entra recebida
    // no caixa; no marketplace o dinheiro volta ao comprador). Se o pedido voltar a ser pago, gera outro.
    await db.transaction(async (tx) => {
      await tx
        .update(lancamentos)
        .set({ status: "cancelado", observacoes: sql`trim(${lancamentos.observacoes} || ' Estornado: pedido cancelado.')`, atualizadoEm: new Date() })
        .where(and(eq(lancamentos.origem, origem), inArray(lancamentos.status, ["aberto", "pago"])));
      await tx.update(pedidosMarketplace).set({ financeiroGerado: false }).where(eq(pedidosMarketplace.id, pedido.id));
    });
    return;
  }
  if (!vendido || pedido.financeiroGerado || pedido.total <= 0) return;

  const prazo = await prazoRecebimento(pedido.marketplace);
  await db.transaction(async (tx) => {
    // Trava: só uma execução gera o título.
    const [ok] = await tx
      .update(pedidosMarketplace)
      .set({ financeiroGerado: true })
      .where(and(eq(pedidosMarketplace.id, pedido.id), eq(pedidosMarketplace.financeiroGerado, false)))
      .returning({ id: pedidosMarketplace.id });
    if (!ok) return;
    const venc = new Date(pedido.data.getTime() + prazo * 86400_000);
    const loja = pedido.marketplace === "loja";
    await tx.insert(lancamentos).values({
      tipo: "receber",
      descricao: `Pedido ${numeroPedido(pedido.marketplace, pedido.idExterno)} · ${pedido.comprador || CANAIS[pedido.marketplace].nome}`,
      categoria: `Vendas ${CANAIS[pedido.marketplace].nome}`,
      valor: pedido.total,
      vencimento: venc,
      origem,
      clienteId: pedido.clienteId,
      ...(loja ? { status: "pago" as const, pagoEm: pedido.data, valorPago: pedido.total, contaCaixaId: await contaPadrao(tx) } : {}),
      observacoes: loja ? "" : "Valor bruto do pedido: ao baixar, informe o valor que caiu (já sem taxas do marketplace).",
    });
  });
}

/** Parcelas da nota de entrada viram contas a pagar. */
export async function gerarPagarDaNota(tx: Tx, nota: NotaEntrada) {
  const parcelas = nota.parcelas.length ? nota.parcelas : [{ vencimento: hojeIso(), valor: nota.valorTotal }];
  await tx.insert(lancamentos).values(
    parcelas.map((p, i) => ({
      tipo: "pagar" as const,
      descricao: `NF ${nota.numero || `#${nota.id}`}`,
      categoria: "Compras",
      valor: p.valor,
      vencimento: dia(p.vencimento),
      parcela: parcelas.length > 1 ? `${i + 1}/${parcelas.length}` : "",
      origem: `nota-entrada:${nota.id}`,
      fornecedorId: nota.fornecedorId,
    })),
  );
}

export async function cancelarTitulosDaOrigem(tx: Tx, origem: string) {
  await tx.update(lancamentos).set({ status: "cancelado", atualizadoEm: new Date() }).where(and(eq(lancamentos.origem, origem), eq(lancamentos.status, "aberto")));
}

/** Saldo de cada conta: saldo inicial + recebimentos − pagamentos baixados nela. */
export async function saldosContas() {
  const contas = await db.select().from(contasCaixa).orderBy(asc(contasCaixa.id));
  const mov = await db
    .select({
      contaId: lancamentos.contaCaixaId,
      entradas: sql<number>`coalesce(sum(case when ${lancamentos.tipo} = 'receber' then ${lancamentos.valorPago} else 0 end), 0)::float`,
      saidas: sql<number>`coalesce(sum(case when ${lancamentos.tipo} = 'pagar' then ${lancamentos.valorPago} else 0 end), 0)::float`,
    })
    .from(lancamentos)
    .where(eq(lancamentos.status, "pago"))
    .groupBy(lancamentos.contaCaixaId);
  return contas.map((c) => {
    const m = mov.find((x) => x.contaId === c.id);
    return { ...c, entradas: m?.entradas ?? 0, saidas: m?.saidas ?? 0, saldo: c.saldoInicial + (m?.entradas ?? 0) - (m?.saidas ?? 0) };
  });
}

/** Fluxo de caixa: títulos em aberto por semana (vencidos ficam na semana atual), com saldo projetado. */
export async function fluxoDeCaixa(semanas = 12) {
  const [saldos, abertos] = await Promise.all([saldosContas(), db.select().from(lancamentos).where(eq(lancamentos.status, "aberto"))]);
  const saldoHoje = saldos.filter((c) => c.ativo).reduce((s, c) => s + c.saldo, 0);
  const inicio = dia(hojeIso());
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7)); // segunda-feira desta semana
  let saldo = saldoHoje;
  const linhas = Array.from({ length: semanas }, (_, i) => {
    const de = new Date(inicio.getTime() + i * 7 * 86400_000);
    const ate = new Date(de.getTime() + 7 * 86400_000);
    const daSemana = abertos.filter((l) => (i === 0 ? l.vencimento < ate : l.vencimento >= de && l.vencimento < ate));
    const entradas = daSemana.filter((l) => l.tipo === "receber").reduce((s, l) => s + l.valor, 0);
    const saidas = daSemana.filter((l) => l.tipo === "pagar").reduce((s, l) => s + l.valor, 0);
    saldo += entradas - saidas;
    return { de, entradas, saidas, saldo };
  });
  return { saldoHoje, linhas };
}
