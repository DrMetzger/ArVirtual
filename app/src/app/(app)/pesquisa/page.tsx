import { ExternalLink, Flame, Search, Store, TrendingUp, Trophy, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pesquisarMercado, type ProdutoMercado, type ResultadoPesquisa } from "@/lib/pesquisa-mercado";
import { cn, formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: "Pesquisa de mercado" };

const SUGESTOES = ["enfeite de natal", "vaso decorativo", "suporte controle", "organizador", "luminária", "chaveiro personalizado"];

const link = (q: string, cat?: string) => `/pesquisa?${new URLSearchParams({ q, ...(cat ? { cat } : {}) })}`;

function Selo({ posicao }: { posicao: number }) {
  if (posicao === 1)
    return (
      <Badge tone="gold" className="bg-gold text-[#0a1a33] shadow">
        <Trophy className="size-3.5" /> Campeão<span className="hidden sm:inline"> de vendas</span>
      </Badge>
    );
  if (posicao <= 3)
    return (
      <Badge tone="gold" className="bg-[#0a1a33]/85 text-gold shadow">
        <Flame className="size-3.5" /> {posicao}º<span className="hidden sm:inline"> mais vendido</span>
      </Badge>
    );
  return <Badge className="bg-black/60 text-white shadow">
      {posicao}º<span className="hidden sm:inline"> mais vendido</span>
    </Badge>;
}

function CardProduto({ p }: { p: ProdutoMercado }) {
  const desconto = p.preco && p.precoOriginal ? Math.round((1 - p.preco / p.precoOriginal) * 100) : 0;
  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", p.posicao === 1 && "border-gold ring-1 ring-gold/40")}>
      <a href={p.link} target="_blank" rel="noreferrer" className="relative block aspect-square bg-white">
        {p.imagem ? <img src={p.imagem} alt="" loading="lazy" className="size-full object-contain p-2" /> : null}
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">{p.posicao ? <Selo posicao={p.posicao} /> : null}</span>
        {desconto > 0 ? (
          <Badge tone="red" className="absolute bottom-2 left-2 bg-red text-white">
            -{desconto}%
          </Badge>
        ) : null}
      </a>
      <div className="grid flex-1 content-start gap-1 p-3 sm:p-4">
        <p className="line-clamp-2 text-sm font-semibold">{p.nome}</p>
        {p.preco ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-extrabold text-primary">{formatBRL(p.preco)}</span>
            {p.precoOriginal ? <span className="text-xs text-muted line-through">{formatBRL(p.precoOriginal)}</span> : null}
          </p>
        ) : (
          <p className="text-xs text-muted">Sem vendedor ativo agora</p>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {p.vendedores ? (
            <span className="inline-flex items-center gap-0.5">
              <Store className="size-3" /> {p.vendedores} vendedor{p.vendedores > 1 ? "es" : ""}
            </span>
          ) : null}
          {p.freteGratis ? (
            <span className="inline-flex items-center gap-0.5 text-green">
              <Truck className="size-3" /> Frete grátis
            </span>
          ) : null}
          {p.lojaOficial ? <span>Loja oficial</span> : null}
        </p>
      </div>
      <a href={p.link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 border-t border-border p-2.5 text-sm font-semibold text-primary hover:bg-surface-2">
        Ver no <span className="hidden sm:inline">Mercado Livre</span><span className="sm:hidden">ML</span> <ExternalLink className="size-3.5" />
      </a>
    </Card>
  );
}

const grade = "grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export default async function PesquisaPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  let r: ResultadoPesquisa | null = null;
  let erro = "";
  if (q) {
    try {
      r = await pesquisarMercado(q, sp.cat);
    } catch (e) {
      erro = (e as Error).message;
    }
  }

  return (
    <>
      <PageHeader
        title="Pesquisa de mercado"
        description="O que está vendendo e em alta no Mercado Livre: digite um tema e veja os campeões de venda, preços e concorrência para ter ideias de peças."
      />
      <div className="grid gap-6">
        <Card>
          <form className="flex flex-wrap gap-3 p-4 sm:p-5">
            <Input name="q" defaultValue={q} placeholder="O que você quer pesquisar? (ex.: enfeite de natal, vaso, suporte)" className="min-w-0 flex-1 basis-60" autoFocus={!q} />
            <button type="submit" className={buttonClass("gold")}>
              <Search /> Pesquisar
            </button>
          </form>
          {!q ? (
            <div className="flex flex-wrap gap-2 border-t border-border p-4 sm:px-5">
              <span className="text-sm text-muted">Sugestões:</span>
              {SUGESTOES.map((s) => (
                <Link key={s} href={link(s)} className="rounded-full border border-border px-3 py-1 text-sm hover:border-gold hover:text-gold">
                  {s}
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
        {erro ? <Alert>{erro}</Alert> : null}

        {!q ? (
          <EmptyState icon={<TrendingUp />} title="Pesquise um tema" description="Ex.: “enfeite de natal”. O ERP acha as categorias do Mercado Livre e mostra o ranking de mais vendidos de cada uma." />
        ) : r && !r.categorias.length && !r.catalogo.length ? (
          <EmptyState icon={<Search />} title="Nada encontrado" description="Tente outras palavras." />
        ) : r ? (
          <>
            {r.categorias.length ? (
              <Card>
                <div className="grid gap-3 p-4 sm:p-5">
                  <p className="text-sm font-semibold">Categorias do Mercado Livre para “{q}”</p>
                  <div className="flex flex-wrap gap-2">
                    {r.categorias.map((c) => (
                      <Link
                        key={c.id}
                        href={link(q, c.id)}
                        scroll={false}
                        title={c.caminho}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                          c.id === r.categoria?.id ? "border-gold bg-gold text-[#0a1a33]" : "border-border text-muted hover:border-gold hover:text-foreground",
                        )}
                      >
                        {c.nome}
                      </Link>
                    ))}
                  </div>
                  {r.categoria ? <p className="text-xs text-muted">{r.categoria.caminho}</p> : null}
                  {r.emAlta.length ? (
                    <div className="grid gap-2 border-t border-border pt-3">
                      <p className="flex items-center gap-1 text-sm font-semibold">
                        <Flame className="size-4 text-red" /> Mais buscado nesta categoria
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {r.emAlta.map((t, i) => (
                          <Link key={t} href={link(t)} className="rounded-full bg-surface-2 px-3 py-1 text-sm hover:bg-gold/15 hover:text-gold">
                            <span className="mr-1 text-xs font-bold text-muted">{i + 1}</span>
                            {t}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : null}

            {r.categoria ? (
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Trophy className="size-5 text-gold" /> Mais vendidos em {r.categoria.nome}
                    </span>
                  }
                  description={`Ranking oficial do Mercado Livre, atualizado por eles todo dia.${r.ocultos ? ` ${r.ocultos} posição(ões) são anúncios avulsos que o ML não libera para consulta e ficam de fora.` : ""}`}
                />
                {r.maisVendidos.length ? (
                  <div className={grade}>
                    {r.maisVendidos.map((p) => (
                      <CardProduto key={p.id} p={p} />
                    ))}
                  </div>
                ) : (
                  <p className="p-5 text-sm text-muted">O Mercado Livre não liberou o ranking desta categoria.</p>
                )}
              </Card>
            ) : null}

            {r.catalogo.length ? (
              <Card>
                <CardHeader title={`Produtos do catálogo para “${q}”`} description="Produtos que batem com a pesquisa, com o menor preço entre os vendedores e quantos disputam a venda." />
                <div className={grade}>
                  {r.catalogo.map((p) => (
                    <CardProduto key={p.id} p={p} />
                  ))}
                </div>
              </Card>
            ) : null}
            <p className="text-xs text-muted">
              O Mercado Livre não informa a quantidade vendida de outros vendedores: a posição no ranking é a medida de venda. Use as ideias para criar suas peças com fotos e
              vídeos próprios.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}
