import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { MarcaIcone } from "@/components/marca";
import { ArrowRight, BadgePercent, CheckCircle2, Circle, FileText, Gauge, Package, PiggyBank, Printer, ShoppingBag, Snowflake, Trophy, Truck, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import { VendasChart, type PontoVendas } from "@/components/vendas-chart";
import { db } from "@/db";
import { afiliadosComissoes, clientes, contasMarketplace, MARKETPLACES, notas, pedidosMarketplace, produtos, regrasFiscais, sentinelaItens } from "@/db/schema";
import { analisarVendas } from "@/lib/analise-vendas";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import { estatisticaAnuncios } from "@/lib/sentinela";
import { requireUser } from "@/lib/auth";
import { diasParaVencer } from "@/lib/fiscal/certificado";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { getSettings } from "@/lib/settings";
import { formatBRL, formatDate } from "@/lib/utils";
import { StatusNota } from "./notas/status";
import { LinhaLink } from "@/components/linha-link";

const DIAS = 30;
// Pedidos cancelados não entram no faturamento.
const CANCELADO = sql`lower(${pedidosMarketplace.status}) not in ('cancelled', 'canceled', 'cancelado')`;

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-6 -top-6 size-24 rounded-full bg-gold/10" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl">{value}</p>
          {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
        </div>
        <div className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary [&_svg]:size-5">{icon}</div>
      </div>
    </Card>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const desde = new Date(Date.now() - DIAS * 86400_000);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [porDia, porMarketplace, notasMes, totais, ultimasNotas, estoqueBaixo, setup] = await Promise.all([
    db
      .select({
        dia: sql<string>`to_char(${pedidosMarketplace.data} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
        marketplace: pedidosMarketplace.marketplace,
        total: sql<number>`sum(${pedidosMarketplace.total})::float`,
      })
      .from(pedidosMarketplace)
      .where(and(gte(pedidosMarketplace.data, desde), CANCELADO))
      .groupBy(sql`1`, pedidosMarketplace.marketplace),
    db
      .select({
        marketplace: pedidosMarketplace.marketplace,
        total: sql<number>`coalesce(sum(${pedidosMarketplace.total}), 0)::float`,
        pedidos: sql<number>`count(*)::int`,
      })
      .from(pedidosMarketplace)
      .where(and(gte(pedidosMarketplace.data, desde), CANCELADO))
      .groupBy(pedidosMarketplace.marketplace),
    db
      .select({ total: sql<number>`coalesce(sum(${notas.totalNota}), 0)::float`, qtd: sql<number>`count(*)::int` })
      .from(notas)
      .where(and(eq(notas.status, "autorizada"), gte(notas.criadoEm, inicioMes))),
    Promise.all([db.$count(clientes), db.$count(produtos, eq(produtos.ativo, true))]),
    db.query.notas.findMany({ with: { cliente: { columns: { nome: true } } }, orderBy: desc(notas.criadoEm), limit: 5 }),
    db
      .select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku, estoque: produtos.estoque })
      .from(produtos)
      .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false), lte(produtos.estoque, 2)))
      .orderBy(produtos.estoque)
      .limit(5),
    Promise.all([
      db.query.empresa.findFirst({ columns: { cnpj: true } }),
      db.$count(regrasFiscais),
      db.$count(contasMarketplace),
      getSettings(["gemini.apiKey"]),
      db.$count(produtos),
      db.query.certificadoDigital.findFirst({ columns: { validoAte: true } }),
    ]),
  ]);

  const [analise, estAnuncios, metas, recentes, comissoes, oportunidades] = await Promise.all([
    analisarVendas("30d").catch(() => null),
    estatisticaAnuncios().catch(() => null),
    getSettings(["meta.anuncios.magalu", "meta.anuncios.mercadolivre", "meta.anuncios.shopee"]),
    db
      .select({ id: pedidosMarketplace.id, marketplace: pedidosMarketplace.marketplace, idExterno: pedidosMarketplace.idExterno, status: pedidosMarketplace.status, comprador: pedidosMarketplace.comprador, total: pedidosMarketplace.total, data: pedidosMarketplace.data })
      .from(pedidosMarketplace)
      .where(gte(pedidosMarketplace.data, new Date(Date.now() - 45 * 86400_000)))
      .orderBy(pedidosMarketplace.data),
    db
      .select({ total: sql<number>`coalesce(sum(${afiliadosComissoes.comissao}), 0)::float`, qtd: sql<number>`count(*)::int` })
      .from(afiliadosComissoes)
      .where(and(gte(afiliadosComissoes.compraEm, desde), sql`${afiliadosComissoes.status} <> 'CANCELLED'`)),
    db
      .select({ id: sentinelaItens.id, nome: sentinelaItens.nome, imagem: sentinelaItens.imagem, preco: sentinelaItens.preco, link: sentinelaItens.link, margem: sql<number>`(${sentinelaItens.analise}->>'margem')::float` })
      .from(sentinelaItens)
      .where(
        and(
          gte(sentinelaItens.vistoEm, new Date(Date.now() - 3 * 86400_000)),
          sql`(${sentinelaItens.analise}->>'v')::int >= 3`,
          sql`(${sentinelaItens.analise}->>'imprimivel')::boolean`,
          sql`(${sentinelaItens.analise}->>'impresso3d')::boolean`,
          sql`(${sentinelaItens.analise}->>'margem')::float >= 30`,
        ),
      )
      .orderBy(desc(sentinelaItens.velocidade), desc(sentinelaItens.vendas))
      .limit(4),
  ]);
  const aEnviar = recentes.filter((p) => situacaoPedido(p.marketplace, p.status) === "pago");
  const META_PADRAO = { magalu: 30, mercadolivre: 30, shopee: 40 } as const;
  const termometro = (["magalu", "mercadolivre", "shopee"] as const).map((c) => {
    const pl = estAnuncios?.plataformas.find((x) => x.canal === c);
    const meta = Number(metas[`meta.anuncios.${c}`]) || META_PADRAO[c];
    const ativos = pl?.ativos ?? 0;
    return { canal: c, ativos, meta, falta: Math.max(0, meta - ativos), pct: Math.min(100, (ativos / meta) * 100), prontos: pl?.semAnuncio ?? [] };
  });
  const variacao = analise && analise.totaisAntes.faturamento ? ((analise.totais.faturamento - analise.totaisAntes.faturamento) / analise.totaisAntes.faturamento) * 100 : null;

  // Série diária contínua (dias sem venda aparecem zerados).
  const dados: PontoVendas[] = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
    const ponto: PontoVendas = { dia: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
    for (const m of MARKETPLACES) ponto[m] = porDia.find((r) => r.dia === iso && r.marketplace === m)?.total ?? 0;
    dados.push(ponto);
  }
  const vendas = porMarketplace.reduce((s, r) => s + r.total, 0);
  const qtdPedidos = porMarketplace.reduce((s, r) => s + r.pedidos, 0);
  const [qtdClientes, qtdProdutos] = totais;
  const [emp, qtdRegras, qtdContas, chaves, qtdProdTotal, cert] = setup;
  const diasCert = cert ? diasParaVencer(cert.validoAte) : null;

  const passos = [
    { ok: Boolean(emp?.cnpj), label: "Dados da empresa", href: "/configuracoes?aba=empresa" },
    { ok: qtdRegras > 0, label: "Matriz fiscal", href: "/fiscal" },
    { ok: qtdProdTotal > 0, label: "Primeiro produto", href: "/produtos/novo" },
    { ok: diasCert !== null && diasCert >= 0, label: "Certificado A1", href: "/configuracoes?aba=certificado" },
    { ok: qtdContas > 0, label: "Conectar marketplaces", href: "/marketplaces" },
    { ok: Boolean(chaves["gemini.apiKey"]), label: "IA Gemini", href: "/configuracoes?aba=integracoes" },
  ];
  const pendentes = passos.filter((p) => !p.ok).length;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gold">Olá, {user.nome.split(" ")[0]}</p>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Visão geral</h1>
          <p className="mt-1 text-sm text-muted">Vendas, lucro, envios, anúncios e oportunidades dos últimos {DIAS} dias.</p>
        </div>
        <Link href="/notas/nova" className={buttonClass("gold")}>
          <FileText /> Nova nota fiscal
        </Link>
      </div>

      {diasCert !== null && diasCert <= 30 ? (
        <div className="mb-6">
          <Alert tone={diasCert < 0 ? "red" : "gold"}>
            {diasCert < 0 ? "O certificado digital A1 está vencido: as notas não serão emitidas." : `O certificado digital A1 vence em ${diasCert} dias.`}{" "}
            <Link href="/configuracoes?aba=certificado" className="font-semibold underline">
              Trocar certificado
            </Link>
          </Alert>
        </div>
      ) : null}

      {pendentes > 0 ? (
        <Card className="mb-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display font-bold">Primeiros passos</p>
            <span className="text-xs text-muted">
              {passos.length - pendentes} de {passos.length} concluídos
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {passos.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${p.ok ? "border-green/30 text-green" : "border-border hover:border-gold hover:text-gold"}`}
              >
                {p.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <Circle className="size-4 shrink-0 text-muted" />}
                {p.label}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={<TrendingUp />}
          label={`Vendas · ${DIAS} dias`}
          value={formatBRL(vendas)}
          sub={variacao == null ? `${qtdPedidos} pedidos` : `${qtdPedidos} pedidos · ${variacao >= 0 ? "▲" : "▼"} ${Math.abs(variacao).toFixed(0)}% vs. 30 dias antes`}
        />
        <Kpi
          icon={<PiggyBank />}
          label="Lucro estimado · 30 dias"
          value={formatBRL(analise?.totais.lucro ?? 0)}
          sub={analise?.totais.faturamento ? `${((analise.totais.lucro / analise.totais.faturamento) * 100).toFixed(0)}% do vendido, após taxas e custo` : "após taxas e custo"}
        />
        <Kpi icon={<Truck />} label="A enviar" value={`${aEnviar.length} pedido(s)`} sub={aEnviar.length ? `mais antigo: ${formatDate(aEnviar[0]!.data)}` : "nada pendente"} />
        <Kpi icon={<ShoppingBag />} label="Ticket médio" value={formatBRL(qtdPedidos ? vendas / qtdPedidos : 0)} sub={`${analise?.totais.unidades ?? 0} unidades vendidas`} />
        <Kpi icon={<FileText />} label="NF-e no mês" value={formatBRL(notasMes[0]?.total ?? 0)} sub={`${notasMes[0]?.qtd ?? 0} notas autorizadas`} />
        <Kpi icon={<BadgePercent />} label="Afiliados · 30 dias" value={formatBRL(comissoes[0]?.total ?? 0)} sub={`${comissoes[0]?.qtd ?? 0} venda(s) · ${qtdClientes} clientes · ${qtdProdutos} produtos`} />
      </div>

      <Card className="mb-6">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Gauge className="size-5 text-gold" /> Termômetro da loja: anúncios ativos x meta
            </span>
          }
          description="Loja com poucos anúncios não ganha tração no algoritmo. As plataformas não publicam o número: Magalu indicou 30; na Shopee as lojas que mais vendem têm 40 a 50; no ML não há número oficial. Ajuste em Configurações › Metas da loja."
        />
        <div className="grid gap-4 p-5 lg:grid-cols-3">
          {termometro.map((t) => (
            <div key={t.canal} className="grid content-start gap-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <MarcaIcone canal={t.canal} className="size-6" /> {MARKETPLACE_INFO[t.canal].nome}
                </span>
                {t.falta ? <Badge tone={t.pct >= 60 ? "gold" : "red"}>faltam {t.falta}</Badge> : <Badge tone="green">meta batida</Badge>}
              </div>
              <p>
                <span className="text-3xl font-extrabold">{t.ativos}</span>
                <span className="text-sm text-muted"> / {t.meta} anúncios ativos</span>
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${t.pct >= 100 ? "bg-green" : t.pct >= 60 ? "bg-gold" : "bg-red"}`} style={{ width: `${Math.max(3, t.pct)}%` }} />
              </div>
              {t.falta && t.prontos.length ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-gold">
                    {t.prontos.length} produto(s) seus prontos para anunciar aqui
                  </summary>
                  <div className="mt-2 grid gap-1">
                    {t.prontos.slice(0, 12).map((p) => (
                      <Link key={p.id} href={`/produtos/${p.id}`} className="truncate text-xs hover:text-gold">
                        • {p.nome}
                      </Link>
                    ))}
                  </div>
                </details>
              ) : t.falta ? (
                <Link href="/sentinela" className="text-xs font-semibold text-gold hover:underline">
                  Todos os seus produtos já estão aqui: veja no Sentinela o que fabricar para crescer o catálogo
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Vendas por dia"
            description="Mercado Livre, Magalu e Shopee"
            action={
              <Link href="/marketplaces" className={buttonClass("ghost", "sm")}>
                Pedidos <ArrowRight />
              </Link>
            }
          />
          <div className="p-5">
            {qtdPedidos ? (
              <VendasChart
                dados={dados}
                series={MARKETPLACES.map((m) => ({ key: m, nome: MARKETPLACE_INFO[m].nome, cor: MARKETPLACE_INFO[m].cor }))}
              />
            ) : (
              <div className="grid h-72 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted">
                <div>
                  <p>Nenhum pedido nos últimos {DIAS} dias.</p>
                  <Link href="/marketplaces" className="font-semibold text-gold underline">
                    Conecte e sincronize seus marketplaces
                  </Link>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Por marketplace" description={`Últimos ${DIAS} dias`} />
          <div className="grid gap-4 p-5">
            {MARKETPLACES.map((m) => {
              const r = porMarketplace.find((x) => x.marketplace === m);
              const pct = vendas ? ((r?.total ?? 0) / vendas) * 100 : 0;
              return (
                <div key={m} className="grid gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <MarcaIcone canal={m} />
                      {MARKETPLACE_INFO[m].nome}
                    </span>
                    <span className="font-semibold">{formatBRL(r?.total ?? 0)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: MARKETPLACE_INFO[m].cor }} />
                  </div>
                  <p className="text-xs text-muted">
                    {r?.pedidos ?? 0} pedidos · {pct.toFixed(0)}% das vendas
                    {(() => {
                      const c = analise?.canais.find((x) => x.canal === m);
                      return c && c.faturamento ? ` · taxas ${formatBRL(c.taxas)} · lucro ${formatBRL(c.lucro)}` : "";
                    })()}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Trophy className="size-5 text-gold" /> Mais vendidos · 30 dias
              </span>
            }
            action={
              <Link href="/analises" className={buttonClass("ghost", "sm")}>
                Análise <ArrowRight />
              </Link>
            }
          />
          {analise?.ranking.length ? (
            <div className="divide-y divide-border">
              {analise.ranking.slice(0, 6).map((r, i) => (
                <div key={r.chave} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-4 text-center font-bold text-muted">{i + 1}</span>
                  {r.imagem ? <img src={r.imagem} alt="" className="size-10 rounded-lg bg-white object-contain" /> : <div className="size-10 rounded-lg bg-surface-2" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.nome}</p>
                    <p className="text-xs text-muted">
                      {r.unidades} un. · {formatBRL(r.faturamento)} · lucro <span className={r.lucro >= 0 ? "text-green" : "text-red"}>{formatBRL(r.lucro)}</span>
                    </p>
                  </div>
                  <Badge tone={r.classe === "A" ? "green" : r.classe === "B" ? "gold" : "neutral"}>{r.classe}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Sem vendas nos últimos 30 dias.</p>
          )}
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Truck className="size-5 text-gold" /> Pedidos a enviar ({aEnviar.length})
              </span>
            }
            action={
              <Link href="/pedidos" className={buttonClass("ghost", "sm")}>
                Pedidos <ArrowRight />
              </Link>
            }
          />
          {aEnviar.length ? (
            <div className="divide-y divide-border">
              {aEnviar.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/pedidos/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                  <MarcaIcone canal={p.marketplace} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.comprador || p.idExterno}</p>
                    <p className="text-xs text-muted">{formatDate(p.data)}</p>
                  </div>
                  <span className="font-semibold">{formatBRL(p.total)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Nenhum pedido esperando envio.</p>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Printer className="size-5 text-gold" /> O que imprimir para vender mais
              </span>
            }
            description="Peças 3D que estão vendendo e deixam margem no Magalu (Sentinela)."
            action={
              <Link href="/sentinela" className={buttonClass("ghost", "sm")}>
                Sentinela <ArrowRight />
              </Link>
            }
          />
          {oportunidades.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {oportunidades.map((o) => (
                <a key={o.id} href={o.link} target="_blank" rel="noreferrer" className="grid gap-1 rounded-xl border border-border p-2 text-xs hover:border-gold">
                  {o.imagem ? <img src={o.imagem} alt="" className="aspect-square w-full rounded-lg bg-white object-contain" /> : <div className="aspect-square rounded-lg bg-surface-2" />}
                  <p className="line-clamp-2 font-semibold">{o.nome}</p>
                  <p>
                    {formatBRL(o.preco)} · <span className="font-bold text-green">{o.margem.toFixed(0)}%</span>
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">O Sentinela ainda não aprovou oportunidades.</p>
          )}
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Snowflake className="size-5 text-gold" /> Anunciados e parados · 30 dias
              </span>
            }
            description="Produtos no ar que não venderam: revise preço, fotos e título, ou troque."
          />
          {analise?.parados.length ? (
            <div className="divide-y divide-border">
              {analise.parados.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/produtos/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                  {p.imagem ? <img src={p.imagem} alt="" className="size-10 rounded-lg bg-white object-contain" /> : <div className="size-10 rounded-lg bg-surface-2" />}
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.nome}</span>
                </Link>
              ))}
              {analise.parados.length > 6 ? <p className="px-5 py-2 text-xs text-muted">e mais {analise.parados.length - 6}</p> : null}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Todos os anunciados venderam no período.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Últimas notas"
            action={
              <Link href="/notas" className={buttonClass("ghost", "sm")}>
                Ver todas <ArrowRight />
              </Link>
            }
          />
          {ultimasNotas.length ? (
            <table className="table-base">
              <tbody>
                {ultimasNotas.map((n) => (
                  <LinhaLink key={n.id} href={`/notas/${n.id}`}>
                    <td>
                      <Link href={`/notas/${n.id}`} className="font-semibold hover:text-gold">
                        {n.numero ? `NF-e ${n.numero}` : "Rascunho"}
                      </Link>
                      <p className="text-xs text-muted">{n.cliente.nome}</p>
                    </td>
                    <td className="text-xs text-muted">{formatDate(n.criadoEm)}</td>
                    <td>
                      <StatusNota status={n.status} />
                    </td>
                    <td className="text-right font-semibold">{formatBRL(n.totalNota)}</td>
                  </LinhaLink>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-5 text-sm text-muted">Nenhuma nota ainda.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Estoque baixo" description="Produtos ativos com 2 unidades ou menos" />
          {estoqueBaixo.length ? (
            <div className="grid divide-y divide-border">
              {estoqueBaixo.map((p) => (
                <Link key={p.id} href={`/produtos/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <Package className="size-4 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.nome}</p>
                    <p className="font-mono text-xs text-muted">{p.sku}</p>
                  </div>
                  <Badge tone={p.estoque <= 0 ? "red" : "gold"}>{p.estoque} un.</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Tudo certo com o estoque.</p>
          )}
        </Card>
      </div>
    </>
  );
}
