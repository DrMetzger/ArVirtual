import { and, gte, lt, sql } from "drizzle-orm";
import { ArrowDownRight, ArrowUpRight, ExternalLink, MousePointerClick, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosComissoes } from "@/db/schema";
import { cn, formatBRL } from "@/lib/utils";
import { sincronizarComissoesAgora } from "./actions";

const FUSO = "America/Sao_Paulo";
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: FUSO });
const inicioDia = (iso: string) => new Date(`${iso}T00:00:00-03:00`);
const somarDias = (iso: string, n: number) => diaSP(new Date(inicioDia(iso).getTime() + n * 86400_000 + 12 * 3600_000));

export const PERIODOS = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
  "mes-passado": "Mês passado",
} as const;
export type Periodo = keyof typeof PERIODOS;

/** Intervalo [de, ate) do período e o período anterior do mesmo tamanho (para o "vs anterior"). */
function intervalo(p: Periodo) {
  const hoje = diaSP(new Date());
  const [de, ate] = (() => {
    switch (p) {
      case "hoje":
        return [hoje, somarDias(hoje, 1)];
      case "ontem":
        return [somarDias(hoje, -1), hoje];
      case "7d":
        return [somarDias(hoje, -6), somarDias(hoje, 1)];
      case "30d":
        return [somarDias(hoje, -29), somarDias(hoje, 1)];
      case "mes":
        return [`${hoje.slice(0, 8)}01`, somarDias(hoje, 1)];
      case "mes-passado": {
        const inicio = `${somarDias(`${hoje.slice(0, 8)}01`, -1).slice(0, 8)}01`;
        return [inicio, `${hoje.slice(0, 8)}01`];
      }
    }
  })();
  const ms = inicioDia(ate).getTime() - inicioDia(de).getTime();
  return { de: inicioDia(de), ate: inicioDia(ate), antes: new Date(inicioDia(de).getTime() - ms), deIso: de, ateIso: somarDias(ate, -1) };
}

async function metricas(de: Date, ate: Date) {
  const [r] = await db
    .select({
      pedidos: sql<number>`count(distinct ${afiliadosComissoes.orderId}) filter (where ${afiliadosComissoes.status} <> 'CANCELLED')::int`,
      comissao: sql<number>`coalesce(sum(${afiliadosComissoes.comissao}) filter (where ${afiliadosComissoes.status} <> 'CANCELLED'), 0)::float`,
      itens: sql<number>`coalesce(sum(${afiliadosComissoes.quantidade}) filter (where ${afiliadosComissoes.status} <> 'CANCELLED'), 0)::int`,
      valor: sql<number>`coalesce(sum(${afiliadosComissoes.valor}) filter (where ${afiliadosComissoes.status} <> 'CANCELLED'), 0)::float`,
      novos: sql<number>`count(distinct ${afiliadosComissoes.conversionId}) filter (where ${afiliadosComissoes.compradorTipo} = 'NEW' and ${afiliadosComissoes.status} <> 'CANCELLED')::int`,
    })
    .from(afiliadosComissoes)
    .where(and(gte(afiliadosComissoes.compraEm, de), lt(afiliadosComissoes.compraEm, ate)));
  return r ?? { pedidos: 0, comissao: 0, itens: 0, valor: 0, novos: 0 };
}

/** Nome do canal como a Shopee manda (ex.: "Shopee Video", "Social Media") em português. */
function nomeCanal(c: string) {
  const t = c.toLowerCase();
  if (!t) return "Outros / não informado";
  if (t.includes("video")) return "Shopee Vídeo";
  if (t.includes("live")) return "Shopee Live";
  if (t.includes("social")) return "Redes sociais";
  if (t.includes("web")) return "Site";
  return c;
}

/** Painel de afiliado (como o da Shopee): métricas do período com comparação, canais e top produtos. */
export async function PainelAfiliados({ periodo }: { periodo: Periodo }) {
  const iv = intervalo(periodo);
  const [atual, anterior, canais, top] = await Promise.all([
    metricas(iv.de, iv.ate),
    metricas(iv.antes, iv.de),
    db
      .select({ canal: afiliadosComissoes.canal, pedidos: sql<number>`count(distinct ${afiliadosComissoes.orderId})::int`, comissao: sql<number>`sum(${afiliadosComissoes.comissao})::float` })
      .from(afiliadosComissoes)
      .where(and(gte(afiliadosComissoes.compraEm, iv.de), lt(afiliadosComissoes.compraEm, iv.ate), sql`${afiliadosComissoes.status} <> 'CANCELLED'`))
      .groupBy(afiliadosComissoes.canal),
    db
      .select({
        itemId: afiliadosComissoes.itemId,
        nome: sql<string>`max(${afiliadosComissoes.itemNome})`,
        imagem: sql<string>`max(${afiliadosComissoes.imagem})`,
        itens: sql<number>`sum(${afiliadosComissoes.quantidade})::int`,
        comissao: sql<number>`sum(${afiliadosComissoes.comissao})::float`,
      })
      .from(afiliadosComissoes)
      .where(and(gte(afiliadosComissoes.compraEm, iv.de), lt(afiliadosComissoes.compraEm, iv.ate), sql`${afiliadosComissoes.status} <> 'CANCELLED'`))
      .groupBy(afiliadosComissoes.itemId)
      .orderBy(sql`sum(${afiliadosComissoes.quantidade}) desc`)
      .limit(5),
  ]);
  const totalCanais = canais.reduce((s, c) => s + c.pedidos, 0);

  const cartoes: { titulo: string; valor: string; atual: number; antes: number }[] = [
    { titulo: "Pedidos", valor: String(atual.pedidos), atual: atual.pedidos, antes: anterior.pedidos },
    { titulo: "Comissão est.", valor: formatBRL(atual.comissao), atual: atual.comissao, antes: anterior.comissao },
    { titulo: "Itens vendidos", valor: String(atual.itens), atual: atual.itens, antes: anterior.itens },
    { titulo: "Valor do pedido", valor: formatBRL(atual.valor), atual: atual.valor, antes: anterior.valor },
    { titulo: "Novos compradores", valor: String(atual.novos), atual: atual.novos, antes: anterior.novos },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap gap-1">
          {Object.entries(PERIODOS).map(([k, r]) => (
            <Link
              key={k}
              href={`/afiliados?periodo=${k}`}
              scroll={false}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", k === periodo ? "bg-gold text-[#0a1a33]" : "text-muted hover:bg-surface-2 hover:text-foreground")}
            >
              {r}
            </Link>
          ))}
        </div>
        <form action={sincronizarComissoesAgora} className="ml-auto">
          <input type="hidden" name="de" value={iv.deIso} />
          <input type="hidden" name="ate" value={iv.ateIso} />
          <input type="hidden" name="voltar" value={`/afiliados?periodo=${periodo}`} />
          <SubmitButton variant="outline" size="sm" pendingText="Buscando...">
            <RefreshCw /> Atualizar da Shopee
          </SubmitButton>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-3 xl:grid-cols-6">
        {/* A API de afiliados da Shopee não informa cliques: o número fica no painel deles. */}
        <a
          href="https://affiliate.shopee.com.br/dashboard"
          target="_blank"
          rel="noreferrer"
          className="grid content-start gap-1 rounded-xl border border-dashed border-border p-3 hover:border-gold"
        >
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            <MousePointerClick className="size-3.5" /> Cliques
          </span>
          <span className="text-sm font-semibold text-gold">Ver no painel da Shopee <ExternalLink className="inline size-3" /></span>
          <span className="text-[11px] leading-tight text-muted">A Shopee não envia cliques pela API.</span>
        </a>
        {cartoes.map((c) => {
          const variacao = c.antes ? ((c.atual - c.antes) / c.antes) * 100 : c.atual ? 100 : 0;
          return (
            <div key={c.titulo} className={cn("grid content-start gap-1 rounded-xl border p-3", c.titulo === "Comissão est." ? "border-gold/50" : "border-border")}>
              <span className="text-xs font-semibold text-muted">{c.titulo}</span>
              <span className={cn("text-xl font-extrabold whitespace-nowrap", c.titulo === "Comissão est." && "text-gold")}>{c.valor}</span>
              <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", variacao > 0 ? "text-green" : variacao < 0 ? "text-red" : "text-muted")}>
                {variacao > 0 ? <ArrowUpRight className="size-3.5" /> : variacao < 0 ? <ArrowDownRight className="size-3.5" /> : null}
                {variacao ? `${variacao > 0 ? "+" : ""}${variacao.toFixed(0)}%` : "0%"}
                <span className="font-normal text-muted">vs anterior</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-border p-4 sm:p-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold">Pedidos por canal</p>
          {canais.length ? (
            canais
              .sort((a, b) => b.pedidos - a.pedidos)
              .map((c) => (
                <div key={c.canal} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{nomeCanal(c.canal)}</span>
                    <span className="font-semibold">
                      {c.pedidos} <span className="font-normal text-muted">· {formatBRL(c.comissao)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${totalCanais ? (c.pedidos / totalCanais) * 100 : 0}%` }} />
                  </div>
                </div>
              ))
          ) : (
            <p className="text-sm text-muted">Nenhuma venda no período.</p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold">Top 5 produtos</p>
          {top.length ? (
            top.map((t, i) => (
              <div key={t.itemId} className="flex items-center gap-3 text-sm">
                <span className="w-4 text-xs font-bold text-muted">{i + 1}</span>
                {t.imagem ? <img src={t.imagem} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <span className="size-9 shrink-0 rounded-lg bg-surface-2" />}
                <span className="min-w-0 flex-1 truncate">{t.nome}</span>
                <span className="text-right text-xs whitespace-nowrap">
                  <span className="font-semibold">{t.itens} vendido(s)</span>
                  <br />
                  <span className="text-green">{formatBRL(t.comissao)}</span>
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Nenhuma venda no período.</p>
          )}
        </div>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">
        A Shopee consolida os dados de afiliado uma vez por dia (por volta das 17h30). O ERP busca sozinho a cada 6 horas; use “Atualizar da Shopee” para buscar agora.
      </p>
    </Card>
  );
}
