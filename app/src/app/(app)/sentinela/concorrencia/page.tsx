import { Award, ExternalLink, MapPin, Search, Star, Store, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import { Abas } from "@/components/abas";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pesquisarConcorrencia, resumir, type Anuncio, type Resumo } from "@/lib/concorrencia";
import { formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: "Concorrência por produto" };

const num = (n: number) => n.toLocaleString("pt-BR");

function CartaoResumo({ canal, nome, r, rotuloVendas }: { canal: "shopee" | "mercadolivre" | "magalu"; nome: string; r: Resumo; rotuloVendas: string }) {
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
      <FotoAmpliavel src={a.imagem} alt={`${a.produto} · ${a.vendedor}`} className="size-20 sm:size-24" />
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
        [...r.shopee, ...r.mercadolivre, ...r.magalu].reduce<Record<string, { a: Anuncio; anuncios: number; min: number; vendas: number }>>((acc, a) => {
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
        description="Quem vende, onde, por quanto e quanto vendeu."
      />
      <div className="grid gap-6">
        <form className="flex flex-wrap gap-2">
          <Input name="q" defaultValue={q} placeholder="Ex.: suporte alexa echo pop, vaso geométrico, dragão articulado" className="min-w-0 flex-1" autoFocus={!q} />
          <button type="submit" className={buttonClass("gold")}>
            <Search /> Pesquisar
          </button>
        </form>

        {!r ? (
          <EmptyState icon={<Users />} title="Quem vende o que você quer vender?" description="Pesquise um produto para ver os concorrentes no Magalu, Mercado Livre e Shopee." />
        ) : (
          <>
            {r.erros.length ? <Alert tone="gold">{r.erros.join(" · ")}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <CartaoResumo canal="magalu" nome="Magalu" r={resumir(r.magalu, false)} rotuloVendas="" />
              <CartaoResumo canal="mercadolivre" nome="Mercado Livre" r={resumir(r.mercadolivre, false)} rotuloVendas="" />
              <CartaoResumo canal="shopee" nome="Shopee" r={resumir(r.shopee, true)} rotuloVendas="Vendas somadas" />
            </div>

            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Store className="size-5 text-gold" /> Quem vende ({vendedores.length})
                  </span>
                }
                description="Só concorrentes diretos (filtrados pela IA), do que mais vende para o que menos vende."
              />
              {vendedores.length ? (
                <div className="divide-y divide-border">
                  {vendedores.slice(0, 40).map(({ a, anuncios, min, vendas }) => (
                    <div key={`${a.plataforma}:${a.vendedorId}`} className="flex items-start gap-3 px-4 py-3 text-sm">
                      <MarcaIcone canal={a.plataforma} className="mt-0.5 size-6" />
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <p className="font-semibold break-words">
                          {a.vendedor}
                          {a.medalha ? <span className="ml-2 text-xs font-normal text-gold">{a.medalha}</span> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {anuncios} anúncio(s) · a partir de <b className="text-foreground">{formatBRL(min)}</b>
                          {a.cidade ? ` · ${a.cidade}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold">{vendas ? `${num(vendas)} vendas` : "—"}</p>
                        <p className="text-[10px] text-muted">{a.plataforma === "shopee" ? "destes anúncios" : a.plataforma === "mercadolivre" ? "total da loja" : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-muted">Nenhum vendedor encontrado para “{q}”.</p>
              )}
            </Card>

            <Abas
              abas={(
                [
                  ["magalu", "Magalu", r.magalu],
                  ["mercadolivre", "Mercado Livre", r.mercadolivre],
                  ["shopee", "Shopee", r.shopee],
                ] as const
              ).map(([k, nome, lista]) => ({
                id: k,
                rotulo: (
                  <>
                    <MarcaIcone canal={k} className="size-5" /> {nome} ({lista.length})
                  </>
                ),
                conteudo: (
                  <Card>
                    {k === "magalu" ? (
                      <p className="px-4 pt-3 text-xs text-muted">
                        Pesquisa da IA no Google dentro do magazineluiza.com.br (o Magalu não tem API de concorrência). Confira pelo link ·{" "}
                        <a href={`https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/`} target="_blank" rel="noreferrer" className="text-gold underline">
                          abrir a busca no Magalu
                        </a>
                      </p>
                    ) : null}
                    <div className="divide-y divide-border">
                      {lista.length ? lista.slice(0, 60).map((a, i) => <Linha key={`${a.link}-${i}`} a={a} />) : <p className="p-5 text-sm text-muted">Ninguém encontrado aqui.</p>}
                    </div>
                  </Card>
                ),
              }))}
            />
            {r.descartados.length ? (
              <details className="rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm text-muted">
                  {r.descartados.length} anúncio(s) que não são o mesmo produto (filtrados) — ver
                </summary>
                <div className="divide-y divide-border">
                  {r.descartados.slice(0, 80).map((a, i) => (
                    <Linha key={`d-${a.link}-${i}`} a={a} />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
