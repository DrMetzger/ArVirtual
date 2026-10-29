import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { BadgePercent, Link2, Search, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Copiavel } from "@/components/copiavel";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosComissoes, afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { afiliadosConfigurado } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL } from "@/lib/utils";
import { adicionarPorLink } from "./actions";
import { STATUS_PRODUTO } from "./status";

export const metadata: Metadata = { title: "Afiliados Shopee" };

export default async function AfiliadosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; status?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  // Início do mês no horário de Brasília.
  const inicioMes = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 8)}01T00:00:00-03:00`);
  const filtro = sp.status && sp.status in STATUS_PRODUTO ? (sp.status as keyof typeof STATUS_PRODUTO) : undefined;

  const [configurado, produtos, mes, porItem, videos] = await Promise.all([
    afiliadosConfigurado(),
    db
      .select()
      .from(afiliadosProdutos)
      .where(filtro ? eq(afiliadosProdutos.status, filtro) : undefined)
      .orderBy(desc(afiliadosProdutos.atualizadoEm)),
    db
      .select({ status: afiliadosComissoes.status, comissao: sql<number>`sum(${afiliadosComissoes.comissao})::float`, pedidos: sql<number>`count(distinct ${afiliadosComissoes.orderId})::int` })
      .from(afiliadosComissoes)
      .where(gte(afiliadosComissoes.compraEm, inicioMes))
      .groupBy(afiliadosComissoes.status),
    // Vendas e comissão que cada produto já gerou (todas as datas).
    db
      .select({ itemId: afiliadosComissoes.itemId, comissao: sql<number>`sum(${afiliadosComissoes.comissao})::float`, vendas: sql<number>`sum(${afiliadosComissoes.quantidade})::int` })
      .from(afiliadosComissoes)
      .where(sql`${afiliadosComissoes.status} <> 'CANCELLED'`)
      .groupBy(afiliadosComissoes.itemId),
    db
      .select({ produtoId: afiliadosVideos.produtoId, n: sql<number>`count(*)::int` })
      .from(afiliadosVideos)
      .where(and(inArray(afiliadosVideos.status, ["bruto", "editado", "postado"])))
      .groupBy(afiliadosVideos.produtoId),
  ]);
  const doMes = (s?: string) => mes.filter((m) => (s ? m.status === s : m.status !== "CANCELLED")).reduce((t, m) => t + m.comissao, 0);
  const pedidosMes = mes.filter((m) => m.status !== "CANCELLED").reduce((t, m) => t + m.pedidos, 0);

  return (
    <>
      <PageHeader
        title="Afiliados Shopee"
        description="Produtos que você divulga, links de afiliado, vídeos para postar e as comissões que entram."
        actions={
          <>
            <Link href="/afiliados/comissoes" className={buttonClass("outline")}>
              <Wallet /> Comissões
            </Link>
            <Link href="/afiliados/buscar" className={buttonClass("gold")}>
              <Search /> Buscar produtos
            </Link>
          </>
        }
      />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        {!configurado ? (
          <Alert tone="gold">
            Para buscar produtos, gerar links e ver as comissões, cadastre o <strong>App ID</strong> e a <strong>Senha</strong> da API de afiliados em{" "}
            <Link href="/configuracoes?aba=integracoes" className="font-semibold underline">
              Configurações › Integrações › Shopee Afiliados
            </Link>{" "}
            (pegue em affiliate.shopee.com.br › Open API).
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kpi titulo="Comissão do mês" valor={formatBRL(doMes())} detalhe="Estimada, sem os cancelados" destaque href="/afiliados/comissoes" />
          <Kpi titulo="Concluída no mês" valor={formatBRL(doMes("COMPLETED"))} detalhe="Pedidos entregues e confirmados" />
          <Kpi titulo="Pedidos no mês" valor={String(pedidosMes)} detalhe="Compras pelos seus links" />
          <Kpi titulo="Divulgando" valor={String(produtos.filter((p) => p.status === "divulgando").length)} detalhe={`${produtos.length} produto(s) na lista`} />
        </div>

        <Card>
          <CardHeader title="Adicionar pelo link" description="Cole o link de qualquer produto da Shopee: o ERP busca a comissão e gera o seu link de afiliado." />
          <form action={adicionarPorLink} className="flex flex-wrap gap-3 p-5">
            <Input name="link" placeholder="https://shopee.com.br/... ou https://s.shopee.com.br/..." className="min-w-[240px] flex-1" required />
            <SubmitButton variant="primary" pendingText="Buscando..." disabled={!configurado}>
              <Link2 /> Adicionar
            </SubmitButton>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Meus produtos de afiliado"
            action={
              <div className="flex flex-wrap gap-1 text-sm">
                {[["", "Todos"], ...Object.entries(STATUS_PRODUTO).map(([k, v]) => [k, v.rotulo])].map(([k, r]) => (
                  <Link
                    key={k}
                    href={k ? `/afiliados?status=${k}` : "/afiliados"}
                    className={cn("rounded-lg px-2.5 py-1", (filtro ?? "") === k ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground")}
                  >
                    {r}
                  </Link>
                ))}
              </div>
            }
          />
          {produtos.length === 0 ? (
            <EmptyState
              icon={<BadgePercent />}
              title="Nenhum produto ainda"
              description="Busque produtos com boa comissão ou cole o link de um produto da Shopee acima."
            />
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {produtos.map((p) => {
                const ganhos = porItem.find((x) => x.itemId === p.itemId);
                const nVideos = videos.find((v) => v.produtoId === p.id)?.n ?? 0;
                const st = STATUS_PRODUTO[p.status];
                return (
                  <Card key={p.id} className="flex flex-col overflow-hidden">
                    <Link href={`/afiliados/${p.id}`} className="flex gap-3 p-4 hover:bg-surface-2/50">
                      {p.imagem ? <img src={p.imagem} alt="" className="size-20 shrink-0 rounded-lg object-cover" /> : <div className="size-20 shrink-0 rounded-lg bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold">{p.nome}</p>
                        <p className="truncate text-xs text-muted">{p.loja}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-semibold">{formatBRL(p.preco)}</span>
                          <span className="font-semibold text-green">
                            {(p.comissaoTaxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {formatBRL(p.comissaoValor)}
                          </span>
                        </p>
                      </div>
                    </Link>
                    <div className="mt-auto grid gap-2 border-t border-border p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge tone={st.tom}>{st.rotulo}</Badge>
                        <span>{nVideos} vídeo(s)</span>
                        {ganhos ? (
                          <span className="font-semibold text-green">
                            {ganhos.vendas} venda(s) · {formatBRL(ganhos.comissao)}
                          </span>
                        ) : null}
                      </div>
                      {p.linkAfiliado ? <Copiavel texto={p.linkAfiliado} /> : <span className="text-xs text-muted">Link de afiliado ainda não gerado.</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Kpi({ titulo, valor, detalhe, destaque, href }: { titulo: string; valor: string; detalhe: string; destaque?: boolean; href?: string }) {
  const corpo = (
    <Card className={cn("p-4 sm:p-5 transition-colors", destaque && "border-gold/50", href && "hover:border-gold/60")}>
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{titulo}</p>
      <p className={cn("mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl", destaque && "text-gold")}>{valor}</p>
      <p className="mt-1 text-xs text-muted">{detalhe}</p>
    </Card>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
