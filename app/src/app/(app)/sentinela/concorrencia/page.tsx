import { Award, ExternalLink, MapPin, Search, Star, Store, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pesquisarConcorrencia, resumir, type Anuncio, type Resumo } from "@/lib/concorrencia";
import { formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: "Concorrência por produto" };

const num = (n: number) => n.toLocaleString("pt-BR");

function CartaoResumo({ canal, nome, r, rotuloVendas }: { canal: "shopee" | "mercadolivre"; nome: string; r: Resumo; rotuloVendas: string }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <MarcaIcone canal={canal} className="size-7" />
        <span className="font-semibold">{nome}</span>
      </div>
      {r.anuncios ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <span className="text-muted">Vendedores</span>
          <span className="text-right font-bold">{num(r.vendedores)}</span>
          <span className="text-muted">Anúncios</span>
          <span className="text-right font-semibold">{num(r.anuncios)}</span>
          <span className="text-muted">Menor preço</span>
          <span className="text-right font-semibold text-green">{formatBRL(r.min)}</span>
          <span className="text-muted">Preço do meio</span>
          <span className="text-right font-bold">{formatBRL(r.mediana)}</span>
          <span className="text-muted">Maior preço</span>
          <span className="text-right font-semibold">{formatBRL(r.max)}</span>
          {r.vendas ? (
            <>
              <span className="text-muted">{rotuloVendas}</span>
              <span className="text-right font-semibold">{num(r.vendas)}</span>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Ninguém encontrado.</p>
      )}
    </div>
  );
}

function Linha({ a }: { a: Anuncio }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {a.imagem ? <img src={a.imagem} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg bg-white object-contain" /> : <div className="size-14 shrink-0 rounded-lg bg-surface-2" />}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold">{a.vendedor}</span>
          {a.lojaOficial ? <Badge tone="blue">{a.plataforma === "shopee" ? "Shopee Mall" : "Loja oficial"}</Badge> : null}
          {a.medalha ? (
            <Badge tone="gold">
              <Award className="size-3" /> {a.medalha}
            </Badge>
          ) : null}
        </div>
        <a href={a.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm text-muted hover:text-gold">
          {a.produto} <ExternalLink className="inline size-3" />
        </a>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {a.vendas != null ? <span>{num(a.vendas)} {a.plataforma === "shopee" ? "vendas do anúncio" : "vendas do vendedor (total)"}</span> : null}
          {a.avaliacao ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3" /> {a.avaliacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            </span>
          ) : null}
          {a.reputacao ? <span>reputação {a.reputacao}</span> : null}
          {a.cidade ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {a.cidade}
            </span>
          ) : null}
          {a.freteGratis ? (
            <span className="inline-flex items-center gap-1 text-green">
              <Truck className="size-3" /> frete grátis
            </span>
          ) : null}
          {a.premium ? <span>anúncio Premium</span> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-extrabold">{formatBRL(a.preco)}</p>
        {a.precoDe ? <p className="text-xs text-muted line-through">{formatBRL(a.precoDe)}</p> : null}
      </div>
    </div>
  );
}

export default async function ConcorrenciaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  const r = q.length >= 3 ? await pesquisarConcorrencia(q) : null;
  // Ranking de vendedores: cada loja/vendedor uma vez, com quantos anúncios tem nesta busca e o menor preço.
  const vendedores = r
    ? Object.values(
        [...r.shopee, ...r.mercadolivre].reduce<Record<string, { a: Anuncio; anuncios: number; min: number; vendas: number }>>((acc, a) => {
          const k = `${a.plataforma}:${a.vendedorId}`;
          const v = (acc[k] ??= { a, anuncios: 0, min: a.preco, vendas: 0 });
          v.anuncios++;
          v.min = Math.min(v.min, a.preco);
          v.vendas = a.plataforma === "shopee" ? v.vendas + (a.vendas ?? 0) : Math.max(v.vendas, a.vendas ?? 0);
          return acc;
        }, {}),
      ).sort((x, y) => y.vendas - x.vendas)
    : [];

  return (
    <>
      <PageHeader
        title="Concorrência por produto"
        description="Digite o produto e veja quem vende, em qual plataforma, por quanto e quanto vendeu. Shopee e Mercado Livre em tempo real."
      />
      <div className="grid gap-6">
        <form className="flex flex-wrap gap-2">
          <Input name="q" defaultValue={q} placeholder="Ex.: suporte alexa echo pop, vaso geométrico, dragão articulado" className="min-w-0 flex-1" autoFocus={!q} />
          <button type="submit" className={buttonClass("gold")}>
            <Search /> Pesquisar
          </button>
        </form>

        {!r ? (
          <EmptyState icon={<Users />} title="Quem vende o que você quer vender?" description="Pesquise um produto (3 letras ou mais) para ver os concorrentes da Shopee e do Mercado Livre." />
        ) : (
          <>
            {r.erros.length ? <Alert tone="gold">{r.erros.join(" · ")}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <CartaoResumo canal="shopee" nome="Shopee" r={resumir(r.shopee, true)} rotuloVendas="Vendas somadas" />
              <CartaoResumo canal="mercadolivre" nome="Mercado Livre" r={resumir(r.mercadolivre, false)} rotuloVendas="" />
              <div className="grid content-start gap-2 rounded-xl border border-border p-4">
                <div className="flex items-center gap-2">
                  <MarcaIcone canal="magalu" className="size-7" />
                  <span className="font-semibold">Magalu</span>
                </div>
                <p className="text-sm text-muted">O Magalu não libera dados de concorrentes por API. Abra a busca do site para conferir:</p>
                <a href={`https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/`} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
                  <ExternalLink /> Ver no Magalu
                </a>
              </div>
            </div>

            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Store className="size-5 text-gold" /> Quem vende ({vendedores.length})
                  </span>
                }
                description="Cada vendedor uma vez, do que mais vende para o que menos vende. Shopee: soma das vendas dos anúncios dele nesta busca. ML: vendas totais do vendedor."
              />
              {vendedores.length ? (
                <div className="divide-y divide-border">
                  {vendedores.slice(0, 40).map(({ a, anuncios, min, vendas }) => (
                    <div key={`${a.plataforma}:${a.vendedorId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <MarcaIcone canal={a.plataforma} className="size-6" />
                      <span className="min-w-0 flex-1 font-semibold">
                        {a.vendedor}
                        {a.medalha ? <span className="ml-2 text-xs font-normal text-gold">{a.medalha}</span> : null}
                        {a.cidade ? <span className="ml-2 text-xs font-normal text-muted">{a.cidade}</span> : null}
                      </span>
                      <span className="text-muted">{anuncios} anúncio(s)</span>
                      <span>a partir de <b>{formatBRL(min)}</b></span>
                      <span className="text-right font-semibold">
                        {vendas ? `${num(vendas)} vendas` : "—"}
                        <span className="block text-[10px] font-normal text-muted">{a.plataforma === "shopee" ? "destes anúncios" : "total da loja no ML"}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-muted">Nenhum vendedor encontrado para “{q}”.</p>
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title={<span className="inline-flex items-center gap-2"><MarcaIcone canal="shopee" /> Anúncios na Shopee ({r.shopee.length})</span>} description="Mais vendidos primeiro." />
                <div className="divide-y divide-border">
                  {r.shopee.slice(0, 50).map((a, i) => (
                    <Linha key={`${a.link}-${i}`} a={a} />
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader
                  title={<span className="inline-flex items-center gap-2"><MarcaIcone canal="mercadolivre" /> Vendedores no Mercado Livre ({r.mercadolivre.length})</span>}
                  description="Todos os vendedores dos produtos de catálogo que batem com a busca, do mais barato ao mais caro."
                />
                <div className="divide-y divide-border">
                  {r.mercadolivre.slice(0, 60).map((a, i) => (
                    <Linha key={`${a.link}-${i}`} a={a} />
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
