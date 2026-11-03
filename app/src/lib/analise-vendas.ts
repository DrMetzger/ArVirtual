import "server-only";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, pedidosMarketplace, produtos, type CanalVenda } from "@/db/schema";
import { situacaoPedido } from "@/lib/marketplaces/situacao";

const FUSO = "America/Sao_Paulo";
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: FUSO });
const inicioDia = (iso: string) => new Date(`${iso}T00:00:00-03:00`);
const somarDias = (iso: string, n: number) => diaSP(new Date(inicioDia(iso).getTime() + n * 86400_000 + 12 * 3600_000));

export const PERIODOS = { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", mes: "Este mês", "mes-passado": "Mês passado", "12m": "12 meses" } as const;
export type Periodo = keyof typeof PERIODOS;

/** Intervalo [de, ate) do período e o anterior do mesmo tamanho (para o "vs anterior"). */
export function intervalo(p: Periodo) {
  const hoje = diaSP(new Date());
  const amanha = somarDias(hoje, 1);
  const [de, ate] =
    p === "7d"
      ? [somarDias(hoje, -6), amanha]
      : p === "90d"
        ? [somarDias(hoje, -89), amanha]
        : p === "12m"
          ? [somarDias(hoje, -364), amanha]
          : p === "mes"
            ? [`${hoje.slice(0, 8)}01`, amanha]
            : p === "mes-passado"
              ? [`${somarDias(`${hoje.slice(0, 8)}01`, -1).slice(0, 8)}01`, `${hoje.slice(0, 8)}01`]
              : [somarDias(hoje, -29), amanha];
  const ms = inicioDia(ate).getTime() - inicioDia(de).getTime();
  return { de: inicioDia(de), ate: inicioDia(ate), antes: new Date(inicioDia(de).getTime() - ms), deIso: de, ateIso: somarDias(ate, -1) };
}

export type Totais = { faturamento: number; pedidos: number; unidades: number; taxas: number; custoProducao: number; lucro: number };
export type LinhaProduto = Totais & { chave: string; produtoId: string | null; nome: string; imagem: string; classe: "A" | "B" | "C"; semCusto: boolean };

const zero = (): Totais => ({ faturamento: 0, pedidos: 0, unidades: 0, taxas: 0, custoProducao: 0, lucro: 0 });

/** Pedidos que viraram venda (pagos, enviados ou entregues) no intervalo, com o custo de cada item pelo SKU do cadastro. */
async function vendas(de: Date, ate: Date, canal?: CanalVenda) {
  const [pedidos, cadastro] = await Promise.all([
    db
      .select({ marketplace: pedidosMarketplace.marketplace, status: pedidosMarketplace.status, total: pedidosMarketplace.total, taxas: pedidosMarketplace.taxas, frete: pedidosMarketplace.freteVendedor, data: pedidosMarketplace.data, itens: pedidosMarketplace.itens })
      .from(pedidosMarketplace)
      .where(and(gte(pedidosMarketplace.data, de), lt(pedidosMarketplace.data, ate), canal ? eq(pedidosMarketplace.marketplace, canal) : undefined)),
    db.select({ id: produtos.id, paiId: produtos.paiId, sku: produtos.sku, nome: produtos.nome, custo: produtos.custo, imagens: produtos.imagens }).from(produtos),
  ]);
  const porId = new Map(cadastro.map((p) => [p.id, p]));
  const porSku = new Map(cadastro.map((p) => [p.sku.trim().toLowerCase(), p]));
  const validos = pedidos.filter((p) => ["pago", "enviado", "entregue"].includes(situacaoPedido(p.marketplace, p.status)));
  return { validos, porId, porSku };
}

function resumir(validos: Awaited<ReturnType<typeof vendas>>["validos"], porSku: Awaited<ReturnType<typeof vendas>>["porSku"], porId: Awaited<ReturnType<typeof vendas>>["porId"]) {
  const t = zero();
  for (const p of validos) {
    t.pedidos++;
    t.faturamento += p.total;
    t.taxas += p.taxas + p.frete;
    for (const i of p.itens) {
      t.unidades += i.quantidade;
      const prod = porSku.get(i.sku.trim().toLowerCase());
      // Variação sem custo próprio usa o custo do produto pai.
      const custo = prod ? prod.custo || (prod.paiId ? (porId.get(prod.paiId)?.custo ?? 0) : 0) : 0;
      t.custoProducao += custo * i.quantidade;
    }
  }
  t.lucro = t.faturamento - t.taxas - t.custoProducao;
  return t;
}

export async function analisarVendas(periodo: Periodo, canal?: CanalVenda) {
  const iv = intervalo(periodo);
  const [atual, anterior] = await Promise.all([vendas(iv.de, iv.ate, canal), vendas(iv.antes, iv.de, canal)]);
  const { validos, porSku, porId } = atual;
  const totais = resumir(validos, porSku, porId);
  const totaisAntes = resumir(anterior.validos, anterior.porSku, anterior.porId);

  // Faturamento no tempo: por dia (até ~3 meses) ou por mês (12 meses).
  const porMes = periodo === "12m";
  const serie = new Map<string, { faturamento: number; pedidos: number }>();
  for (let d = iv.deIso; d <= iv.ateIso; d = somarDias(d, 1)) {
    const k = porMes ? d.slice(0, 7) : d;
    if (!serie.has(k)) serie.set(k, { faturamento: 0, pedidos: 0 });
  }
  const semana = Array.from({ length: 7 }, () => ({ faturamento: 0, pedidos: 0 }));
  const canais = new Map<CanalVenda, Totais>();
  const prods = new Map<string, LinhaProduto>();

  for (const p of validos) {
    const dia = diaSP(p.data);
    const s = serie.get(porMes ? dia.slice(0, 7) : dia);
    if (s) {
      s.faturamento += p.total;
      s.pedidos++;
    }
    const w = semana[new Date(`${dia}T12:00:00-03:00`).getUTCDay()]!;
    w.faturamento += p.total;
    w.pedidos++;

    const c = canais.get(p.marketplace) ?? zero();
    c.pedidos++;
    c.faturamento += p.total;
    c.taxas += p.taxas + p.frete;
    canais.set(p.marketplace, c);

    // Cada item leva a sua parte do valor e das taxas do pedido (proporcional ao valor do item).
    const somaItens = p.itens.reduce((a, i) => a + i.quantidade * i.valorUnitario, 0) || 1;
    for (const i of p.itens) {
      const prod = porSku.get(i.sku.trim().toLowerCase());
      const raiz = prod?.paiId ? porId.get(prod.paiId) : prod;
      const chave = raiz?.id ?? `sku:${i.sku || i.titulo}`;
      const custoUnit = prod ? prod.custo || (raiz?.custo ?? 0) : 0;
      const parte = (i.quantidade * i.valorUnitario) / somaItens;
      const l =
        prods.get(chave) ??
        ({ ...zero(), chave, produtoId: raiz?.id ?? null, nome: raiz?.nome ?? i.titulo, imagem: raiz?.imagens?.[0] ?? "", classe: "C", semCusto: false } as LinhaProduto);
      l.pedidos++;
      l.unidades += i.quantidade;
      l.faturamento += p.total * parte;
      l.taxas += (p.taxas + p.frete) * parte;
      l.custoProducao += custoUnit * i.quantidade;
      if (!custoUnit) l.semCusto = true;
      prods.set(chave, l);
      c.unidades += i.quantidade;
      c.custoProducao += custoUnit * i.quantidade;
    }
  }
  for (const c of canais.values()) c.lucro = c.faturamento - c.taxas - c.custoProducao;

  // Curva ABC pelo faturamento: A = os que somam 80%, B = até 95%, C = o resto.
  const ranking = [...prods.values()].map((l) => ({ ...l, lucro: l.faturamento - l.taxas - l.custoProducao })).sort((a, b) => b.faturamento - a.faturamento);
  let acumulado = 0;
  for (const l of ranking) {
    acumulado += l.faturamento;
    const pct = totais.faturamento ? acumulado / totais.faturamento : 1;
    l.classe = pct <= 0.8 || l === ranking[0] ? "A" : pct <= 0.95 ? "B" : "C";
  }

  // Parados: produto ativo e anunciado que não vendeu nada no período.
  const vendidos = new Set(ranking.map((l) => l.produtoId).filter(Boolean));
  const anunciados = await db
    .selectDistinct({ id: produtos.id, nome: produtos.nome, imagens: produtos.imagens, estoque: produtos.estoque, paiId: produtos.paiId })
    .from(anuncios)
    .innerJoin(produtos, eq(produtos.id, anuncios.produtoId))
    .where(eq(anuncios.status, "publicado"));
  const raizes = await db.select({ id: produtos.id, nome: produtos.nome, imagens: produtos.imagens, ativo: produtos.ativo }).from(produtos).where(isNull(produtos.paiId));
  const raizPorId = new Map(raizes.map((r) => [r.id, r]));
  const parados = [...new Map(anunciados.map((a) => { const r = raizPorId.get(a.paiId ?? a.id); return [r?.id ?? a.id, r] as const; })).values()]
    .filter((r): r is NonNullable<typeof r> => Boolean(r && r.ativo && !vendidos.has(r.id)))
    .map((r) => ({ id: r.id, nome: r.nome, imagem: r.imagens?.[0] ?? "" }));

  return {
    iv,
    totais,
    totaisAntes,
    serie: [...serie.entries()].map(([k, v]) => ({ chave: k, ...v })),
    porMes,
    semana,
    canais: [...canais.entries()].map(([canal, t]) => ({ canal, ...t })).sort((a, b) => b.faturamento - a.faturamento),
    ranking,
    parados,
  };
}
