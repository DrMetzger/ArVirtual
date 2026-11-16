import { eq } from "drizzle-orm";
import { ExternalLink, Eye, Heart, Link2, Music2, Package, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CANAIS, MarcaLogo } from "@/components/marca";
import { SincronizarPedidos } from "@/components/sincronizar-pedidos";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { contasMarketplace, MARKETPLACES, type Marketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ADAPTERS, callbackUrl, MARKETPLACE_INFO } from "@/lib/marketplaces";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { atualizarMetricasTaxas } from "../actions";
import { ContasMarketplace, PedidosRecentes, ResumoMarketplace } from "../blocos";
import { anunciosDoMarketplace, pedidosRecentes, resumoMarketplaces } from "../dados";

/** Painel do vendedor de cada marketplace (atalho no topo da página). */
const PAINEL: Record<Marketplace, string> = {
  mercadolivre: "https://www.mercadolivre.com.br/anuncios/lista",
  shopee: "https://seller.shopee.com.br",
  magalu: "https://seller.magalu.com",
};

const SITUACAO = {
  publicado: { rotulo: "No ar", tom: "green" },
  pausado: { rotulo: "Pausado", tom: "gold" },
  encerrado: { rotulo: "Não existe mais", tom: "neutral" },
  erro: { rotulo: "Erro ao publicar", tom: "red" },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ canal: string }> }): Promise<Metadata> {
  const { canal } = await params;
  return { title: canal === "tiktok" ? "TikTok Shop" : MARKETPLACES.includes(canal as Marketplace) ? CANAIS[canal as Marketplace].nome : "Marketplace" };
}

// Página própria de cada marketplace: tudo o que a API dele oferece num lugar só.
export default async function MarketplacePage({ params, searchParams }: { params: Promise<{ canal: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser();
  const { canal } = await params;
  const { ok, erro } = await searchParams;

  if (canal === "tiktok") {
    return (
      <>
        <PageHeader title="TikTok Shop" description="Integração em preparação." />
        <EmptyState
          icon={<Music2 />}
          title="Em breve"
          description="Quando a TikTok Shop liberar o seu app de parceiro, a loja entra aqui como os outros marketplaces: contas, anúncios, pedidos, taxas e métricas."
        />
      </>
    );
  }
  if (!MARKETPLACES.includes(canal as Marketplace)) notFound();
  const m = canal as Marketplace;
  const info = MARKETPLACE_INFO[m];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const [contas, configurado, resumo, anunciosTodos, pedidos] = await Promise.all([
    db.select().from(contasMarketplace).where(eq(contasMarketplace.marketplace, m)),
    ADAPTERS[m].configurado(),
    resumoMarketplaces(),
    anunciosDoMarketplace(m),
    pedidosRecentes(m),
  ]);
  const r = resumo.find((x) => x.marketplace === m)!;
  // Tentativa que deu erro some da lista quando o mesmo produto já tem anúncio que deu certo neste marketplace.
  const comAnuncio = new Set(anunciosTodos.filter((a) => a.status !== "erro").map((a) => a.produtoId));
  const anuncios = anunciosTodos.filter((a) => a.status !== "erro" || !comAnuncio.has(a.produtoId));
  const noAr = anuncios.filter((a) => a.status === "publicado").length;

  return (
    <>
      <PageHeader
        title={info.nome}
        description={`Contas, anúncios, pedidos, taxas e visualizações do ${info.nome}.`}
        actions={
          <>
            <a href={PAINEL[m]} target="_blank" rel="noreferrer" className={buttonClass("outline", "md")}>
              <ExternalLink /> Painel do vendedor
            </a>
            {contas.length ? (
              <Link href={`/marketplaces/anuncios?conta=${contas[0]!.id}`} className={buttonClass("outline", "md")}>
                <Link2 /> Vincular anúncios
              </Link>
            ) : null}
            <SincronizarPedidos contas={contas.map((c) => ({ id: c.id, nome: c.nome, marketplaceNome: info.nome }))} voltar={`/marketplaces/${m}`} />
          </>
        }
      />
      <div className="grid gap-6">
        {ok ? <Alert tone="green">{ok}</Alert> : null}
        {erro ? <Alert>{erro}</Alert> : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader
              title={<MarcaLogo canal={m} className="h-8" />}
              description="Últimos 30 dias"
              action={
                <form action={atualizarMetricasTaxas.bind(null, `/marketplaces/${m}`)}>
                  <SubmitButton variant="outline" size="sm" pendingText="Atualizando...">
                    <RefreshCw /> Atualizar agora
                  </SubmitButton>
                </form>
              }
            />
            <div className="p-4 sm:p-5">
              <ResumoMarketplace r={r} />
            </div>
          </Card>
          <ContasMarketplace m={m} contas={contas} configurado={configurado} callback={callbackUrl(origin, m)} />
        </div>

        <Card>
          <CardHeader
            title={`Anúncios (${noAr} no ar)`}
            description="Anúncios ligados aos produtos do ERP. A situação e as visualizações são conferidas na API a cada 3 horas (ou em Atualizar agora)."
          />
          {anuncios.length ? (
            <div className="grid divide-y divide-border">
              {anuncios.map((a) => {
                const s = SITUACAO[a.status];
                return (
                  <div key={a.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-5", a.status === "encerrado" && "opacity-60")}>
                    {a.imagem ? (
                      <img src={a.imagem} alt="" className="size-11 shrink-0 rounded-lg bg-surface-2 object-contain" />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                        <Package className="size-5" />
                      </span>
                    )}
                    <Link href={`/produtos/${a.paiId ?? a.produtoId}`} className="min-w-0 flex-1 basis-48 hover:text-gold">
                      <p className="truncate font-semibold">{a.nome}</p>
                      <p className="truncate text-xs text-muted">
                        {a.sku} · {a.conta}
                        {a.idExterno ? ` · ${a.idExterno}` : ""}
                      </p>
                    </Link>
                    <span className="font-semibold">{formatBRL(a.preco)}</span>
                    {m !== "magalu" ? (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", a.visitas ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted")} title="Visualizações">
                        <Eye className="size-3.5" /> {a.visitas.toLocaleString("pt-BR")}
                      </span>
                    ) : null}
                    {m === "shopee" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted" title="Curtidas">
                        <Heart className="size-3.5" /> {a.curtidas}
                      </span>
                    ) : null}
                    <Badge tone={s.tom} title={a.mensagem || undefined}>
                      {s.rotulo}
                    </Badge>
                    {a.link && a.status !== "encerrado" ? (
                      <a href={a.link} target="_blank" rel="noreferrer" className="text-muted hover:text-gold" title="Abrir no marketplace">
                        <ExternalLink className="size-4" />
                      </a>
                    ) : (
                      <span className="size-4" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Package />} title="Nenhum anúncio ligado" description="Publique pelo cadastro do produto ou vincule os anúncios que já existem." />
          )}
          {anuncios.some((a) => a.metricasEm) ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted sm:px-5">
              Última leitura das visualizações: {formatDate(anuncios.reduce((d, a) => (a.metricasEm && a.metricasEm > d ? a.metricasEm : d), new Date(0)))}
            </p>
          ) : null}
        </Card>

        <PedidosRecentes pedidos={pedidos} verTodos={`/pedidos?mp=${m}`} mostrarCanal={false} />
      </div>
    </>
  );
}
