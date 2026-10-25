import { and, desc, eq, gte, ilike, or, type SQL } from "drizzle-orm";
import { CANAIS, MarcaIcone } from "@/components/marca";
import { FileCheck2, Plus, RefreshCw, Search, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, buttonClass, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { CANAIS_VENDA, contasMarketplace, notas, pedidosMarketplace, type CanalVenda } from "@/db/schema";
import { notaVale } from "@/lib/nota-pedido";
import { StatusNota } from "../notas/status";
import { requireUser } from "@/lib/auth";
import { numeroPedido, situacaoPedido, SITUACOES, type Situacao } from "@/lib/marketplaces/situacao";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { sincronizarAgora } from "./actions";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Pedidos" };

const PERIODOS = [
  ["7", "Últimos 7 dias"],
  ["30", "Últimos 30 dias"],
  ["90", "Últimos 90 dias"],
  ["365", "Último ano"],
  ["todos", "Todo o período"],
] as const;
const POR_PAGINA = 50;

type Filtros = { mp?: string; sit?: string; q?: string; periodo?: string; pagina?: string; ok?: string; erro?: string };

export default async function PedidosPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  await requireUser();
  const f = await searchParams;
  const periodo = PERIODOS.some(([v]) => v === f.periodo) ? f.periodo! : "90";
  const mp = CANAIS_VENDA.includes(f.mp as CanalVenda) ? (f.mp as CanalVenda) : undefined;
  const sit = f.sit && f.sit in SITUACOES ? (f.sit as Situacao) : undefined;
  const q = (f.q?.trim() ?? "").replace(/^LU-/i, "");

  const filtros: SQL[] = [];
  if (periodo !== "todos") filtros.push(gte(pedidosMarketplace.data, new Date(Date.now() - Number(periodo) * 86400_000)));
  if (mp) filtros.push(eq(pedidosMarketplace.marketplace, mp));
  if (q) filtros.push(or(ilike(pedidosMarketplace.idExterno, `%${q}%`), ilike(pedidosMarketplace.comprador, `%${q}%`))!);

  const [linhas, contas] = await Promise.all([
    db
      .select({
        id: pedidosMarketplace.id,
        marketplace: pedidosMarketplace.marketplace,
        idExterno: pedidosMarketplace.idExterno,
        status: pedidosMarketplace.status,
        total: pedidosMarketplace.total,
        comprador: pedidosMarketplace.comprador,
        data: pedidosMarketplace.data,
        itens: pedidosMarketplace.itens,
        notaId: pedidosMarketplace.notaId,
        notaStatus: notas.status,
        notaNumero: notas.numero,
        conta: contasMarketplace.nome,
      })
      .from(pedidosMarketplace)
      .leftJoin(contasMarketplace, eq(contasMarketplace.id, pedidosMarketplace.contaId))
      .leftJoin(notas, eq(notas.id, pedidosMarketplace.notaId))
      .where(and(...filtros))
      .orderBy(desc(pedidosMarketplace.data))
      .limit(5000),
    db.select({ id: contasMarketplace.id, ultima: contasMarketplace.ultimaSincronizacao }).from(contasMarketplace),
  ]);

  // A situação é calculada a partir do status de cada marketplace, então o filtro e os totais são feitos aqui.
  const todos = linhas.map((p) => ({ ...p, situacao: situacaoPedido(p.marketplace, p.status) }));
  const pedidos = sit ? todos.filter((p) => p.situacao === sit) : todos;
  const validos = pedidos.filter((p) => p.situacao !== "cancelado" && p.situacao !== "aguardando");
  const faturamento = validos.reduce((s, p) => s + p.total, 0);
  const aEnviar = todos.filter((p) => p.situacao === "pago").length;
  // Nota cancelada/rejeitada não conta: o pedido continua sem nota válida.
  const semNota = validos.filter((p) => !notaVale(p.notaStatus)).length;

  const pagina = Math.max(1, Number(f.pagina) || 1);
  const paginas = Math.max(1, Math.ceil(pedidos.length / POR_PAGINA));
  const visiveis = pedidos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const ultima = contas.map((c) => c.ultima).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const url = (extra: Partial<Filtros>) => {
    const p = new URLSearchParams();
    const v = { mp, sit, q, periodo, ...extra };
    for (const [k, val] of Object.entries(v)) if (val && !(k === "periodo" && val === "90")) p.set(k, String(val));
    const s = p.toString();
    return `/pedidos${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={
          <>
            Vendas do Mercado Livre, Shopee, Magalu e da loja própria num lugar só. Atualiza sozinho a cada 15 minutos
            {ultima ? <> · última sincronização {formatDate(ultima)}</> : null}.
          </>
        }
        actions={
          <>
          <Link href="/pedidos/novo" className={buttonClass("primary")}>
            <Plus /> Novo pedido
          </Link>
          <form action={sincronizarAgora.bind(null, periodo === "todos" ? 3650 : Math.max(Number(periodo), 30))}>
            <SubmitButton variant="gold" pendingText="Sincronizando..." disabled={!contas.length}>
              <RefreshCw /> Sincronizar agora
            </SubmitButton>
          </form>
          </>
        }
      />
      <div className="grid gap-6">
        {f.ok ? <Alert tone="green">{f.ok}</Alert> : null}
        {f.erro ? <Alert>{f.erro}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titulo="Pedidos" valor={String(pedidos.length)} detalhe={PERIODOS.find(([v]) => v === periodo)![1]} />
          <Kpi titulo="Faturamento" valor={formatBRL(faturamento)} detalhe="Pagos, enviados e entregues" />
          <Kpi titulo="Ticket médio" valor={formatBRL(validos.length ? faturamento / validos.length : 0)} detalhe={`${validos.length} pedido(s) pagos`} />
          <Kpi
            titulo="A enviar"
            valor={String(aEnviar)}
            detalhe={`${semNota} pago(s) sem nota fiscal`}
            destaque={aEnviar > 0}
            href={url({ sit: "pago", pagina: undefined })}
          />
        </div>

        <Card>
          <form className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]" action="/pedidos">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input name="q" defaultValue={q} placeholder="Nº do pedido ou comprador" className="pl-9" />
            </div>
            <Select name="mp" defaultValue={mp ?? ""}>
              <option value="">Todos os canais</option>
              {CANAIS_VENDA.map((m) => (
                <option key={m} value={m}>
                  {m === "loja" ? "Loja própria (Sincrolab)" : CANAIS[m].nome}
                </option>
              ))}
            </Select>
            <Select name="sit" defaultValue={sit ?? ""}>
              <option value="">Todas as situações</option>
              {(Object.keys(SITUACOES) as Situacao[]).map((s) => (
                <option key={s} value={s}>
                  {SITUACOES[s].nome}
                </option>
              ))}
            </Select>
            <Select name="periodo" defaultValue={periodo}>
              {PERIODOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>

          {visiveis.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              title={todos.length || q || mp || sit ? "Nenhum pedido com esses filtros" : "Nenhum pedido ainda"}
              description={
                contas.length
                  ? "Os pedidos dos marketplaces aparecem aqui sozinhos (a cada 15 minutos). Vendas da loja própria: Novo pedido."
                  : "Conecte suas contas do Mercado Livre, Shopee e Magalu para trazer os pedidos."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/pedidos/novo" className={buttonClass("primary")}>
                    <Plus /> Novo pedido
                  </Link>
                  {contas.length ? null : (
                    <Link href="/marketplaces" className={buttonClass("gold")}>
                      Conectar marketplaces
                    </Link>
                  )}
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Comprador</th>
                    <th>Itens</th>
                    <th>Data</th>
                    <th>Situação</th>
                    <th>Nota</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const qtd = p.itens.reduce((s, i) => s + i.quantidade, 0);
                    return (
                      <LinhaLink key={p.id} href={`/pedidos/${p.id}`}>
                        <td>
                          <Link href={`/pedidos/${p.id}`} className="block font-mono text-xs font-semibold whitespace-nowrap hover:text-gold">
                            {numeroPedido(p.marketplace, p.idExterno)}
                          </Link>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
                            <MarcaIcone canal={p.marketplace} className="size-5" />
                            {p.conta ?? "Loja própria"}
                          </p>
                        </td>
                        <td>{p.comprador || "—"}</td>
                        <td className="max-w-64">
                          <p className="truncate text-sm">{p.itens[0]?.titulo ?? "—"}</p>
                          {p.itens.length ? (
                            <p className="text-xs text-muted">
                              {qtd} unidade(s){p.itens.length > 1 ? ` · ${p.itens.length} itens` : ""}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap text-muted">{formatDate(p.data)}</td>
                        <td>
                          <Badge tone={SITUACOES[p.situacao].tom}>{SITUACOES[p.situacao].nome}</Badge>
                        </td>
                        <td>
                          {p.notaId && p.notaStatus ? (
                            <Link href={`/notas/${p.notaId}`} className="inline-flex flex-col items-start gap-0.5 text-xs" title="Abrir a nota">
                              <StatusNota status={p.notaStatus} />
                              {p.notaNumero ? <span className="text-muted">NF {p.notaNumero}</span> : null}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="text-right font-semibold whitespace-nowrap">{formatBRL(p.total)}</td>
                      </LinhaLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {paginas > 1 ? (
            <div className="flex items-center justify-between border-t border-border p-4 text-sm">
              <span className="text-muted">
                Página {pagina} de {paginas} · {pedidos.length} pedidos
              </span>
              <div className="flex gap-2">
                {pagina > 1 ? (
                  <Link href={url({ pagina: String(pagina - 1) })} className={buttonClass("outline", "sm")}>
                    Anterior
                  </Link>
                ) : null}
                {pagina < paginas ? (
                  <Link href={url({ pagina: String(pagina + 1) })} className={buttonClass("outline", "sm")}>
                    Próxima
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function Kpi({ titulo, valor, detalhe, destaque, href }: { titulo: string; valor: string; detalhe: string; destaque?: boolean; href?: string }) {
  const corpo = (
    <Card className={cn("p-5 transition-colors", destaque && "border-gold/50", href && "hover:border-gold/60")}>
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{titulo}</p>
      <p className={cn("mt-2 font-display text-2xl font-extrabold", destaque && "text-gold")}>{valor}</p>
      <p className="mt-1 text-xs text-muted">{detalhe}</p>
    </Card>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
