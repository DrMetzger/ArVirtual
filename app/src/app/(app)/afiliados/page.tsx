import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { BadgePercent, Clapperboard, Link2, Plus, Search, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Copiavel } from "@/components/copiavel";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosComissoes, afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { afiliadosConfigurado } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL } from "@/lib/utils";
import { listarVideos } from "@/lib/videos-lista";
import { Conversor } from "../videos/conversor";
import { adicionarPorLink } from "./actions";
import { PainelAfiliados, PERIODOS, type Periodo } from "./painel";
import { STATUS_PRODUTO } from "./status";

export const metadata: Metadata = { title: "Afiliados Shopee" };

export default async function AfiliadosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; status?: string; periodo?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "30d") as Periodo;
  const filtro = sp.status && sp.status in STATUS_PRODUTO ? (sp.status as keyof typeof STATUS_PRODUTO) : undefined;

  const [configurado, produtos, porItem, videos] = await Promise.all([
    afiliadosConfigurado(),
    db
      .select()
      .from(afiliadosProdutos)
      .where(filtro ? eq(afiliadosProdutos.status, filtro) : undefined)
      .orderBy(desc(afiliadosProdutos.atualizadoEm)),
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
  return (
    <>
      <PageHeader
        title="Afiliados Shopee"
        description="Produtos que você divulga, links de afiliado, vídeos para postar e as comissões que entram."
        actions={
          <>
            <a href="#adicionar" className={buttonClass("primary")}>
              <Plus /> Adicionar produtos
            </a>
            <Link href="/videos" className={buttonClass("outline")}>
              <Clapperboard /> Vídeos
            </Link>
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

        <PainelAfiliados periodo={periodo} />

        <Card>
          <CardHeader
            title="Baixar vídeos"
            description="Converta vídeos de TikTok, Instagram, YouTube, Facebook, Threads ou Shopee em MP4 para editar e postar."
            action={
              <Link href="/videos" className={buttonClass("outline", "sm")}>
                <Clapperboard /> Ver todos
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            <Conversor iniciais={await listarVideos()} produtos={produtos.map((p) => ({ id: p.id, nome: p.nome }))} compacto />
          </div>
        </Card>

        <Card id="adicionar">
          <CardHeader
            title="Adicionar produtos pelo link"
            description="Cole o link de um ou de vários produtos da Shopee (um por linha; pode colar também a lista/CSV de links do painel de afiliado). O ERP busca a comissão e gera o link de afiliado de cada um."
          />
          <form action={adicionarPorLink} className="flex flex-wrap items-end gap-3 p-5">
            <Textarea name="link" rows={3} placeholder={"https://shopee.com.br/...\nhttps://s.shopee.com.br/..."} className="min-w-[240px] flex-1" required />
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
              description="Busque produtos com boa comissão ou cole os links dos seus produtos da Shopee acima. Os que já venderam pelos seus links entram sozinhos ao clicar em “Atualizar da Shopee”."
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
                        {p.preco ? (
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                            <span className="font-semibold">{formatBRL(p.preco)}</span>
                            <span className="font-semibold text-green">
                              {(p.comissaoTaxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {formatBRL(p.comissaoValor)}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted">Sem oferta de comissão ativa agora</p>
                        )}
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
