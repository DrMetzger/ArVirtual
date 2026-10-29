import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { MarcaIcone } from "@/components/marca";
import { ArrowRight, CheckCircle2, Circle, FileText, Package, ShoppingBag, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import { VendasChart, type PontoVendas } from "@/components/vendas-chart";
import { db } from "@/db";
import { clientes, contasMarketplace, MARKETPLACES, notas, pedidosMarketplace, produtos, regrasFiscais } from "@/db/schema";
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
          <p className="mt-1 text-sm text-muted">Vendas dos últimos {DIAS} dias nos marketplaces e notas do mês.</p>
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={<TrendingUp />} label={`Vendas · ${DIAS} dias`} value={formatBRL(vendas)} sub={`${qtdPedidos} pedidos`} />
        <Kpi icon={<ShoppingBag />} label="Ticket médio" value={formatBRL(qtdPedidos ? vendas / qtdPedidos : 0)} sub="Marketplaces" />
        <Kpi icon={<FileText />} label="NF-e no mês" value={formatBRL(notasMes[0]?.total ?? 0)} sub={`${notasMes[0]?.qtd ?? 0} notas autorizadas`} />
        <Kpi icon={<Users />} label="Cadastros" value={`${qtdClientes} clientes`} sub={`${qtdProdutos} produtos ativos`} />
      </div>

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
                  </p>
                </div>
              );
            })}
          </div>
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
