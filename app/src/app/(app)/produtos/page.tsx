import { MarcaIcone } from "@/components/marca";
import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Eye, LayoutGrid, List, Package, Plus, Search, ShoppingCart } from "lucide-react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { anuncios, pedidosMarketplace, produtos, type Marketplace } from "@/db/schema";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL } from "@/lib/utils";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Produtos" };

const COOKIE_VISTA = "arv_produtos_vista";

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ q?: string; vista?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  // Grade (tabela) ou cards; a última escolha fica guardada (ver /produtos/vista).
  const vista = sp.vista === "grade" || sp.vista === "cards" ? sp.vista : (await cookies()).get(COOKIE_VISTA)?.value === "grade" ? "grade" : "cards";
  const lista = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
      preco: produtos.preco,
      precosCanal: produtos.precosCanal,
      custo: produtos.custo,
      // Produto com variações: soma o estoque delas.
      estoque: sql<number>`case when "produtos"."tem_variacoes" then (select coalesce(sum(v.estoque), 0)::int from produtos v where v.pai_id = "produtos"."id") else "produtos"."estoque" end`,
      variacoes: sql<number>`(select count(*)::int from produtos v where v.pai_id = "produtos"."id" and v.ativo)`,
      material: produtos.material,
      ativo: produtos.ativo,
      capa: sql<string | null>`${produtos.imagens}[1]`,
      // Nomes qualificados: dentro da subconsulta "id" seria a coluna de anuncios.
      // Marketplaces onde o produto está publicado (uma bandeirinha por plataforma).
      // (inclui os anúncios das variações).
      anuncios: sql<Marketplace[]>`array(select distinct a.marketplace from anuncios a where a.status = 'publicado' and a.produto_id in (select v.id from produtos v where v.id = "produtos"."id" or v.pai_id = "produtos"."id") order by 1)`,
    })
    .from(produtos)
    .where(
      and(
        isNull(produtos.paiId),
        q
          ? or(
              ilike(produtos.nome, `%${q}%`),
              ilike(produtos.sku, `%${q}%`),
              sql`exists (select 1 from produtos v where v.pai_id = "produtos"."id" and (v.sku ilike ${`%${q}%`} or v.cor ilike ${`%${q}%`}))`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(produtos.nome))
    .limit(300);

  // Desempenho plataforma a plataforma de cada produto (somando as variações): visualizações das APIs e
  // vendas/taxas dos pedidos dos últimos 30 dias.
  const ids = lista.map((p) => p.id);
  const [publicados, pedidos30] = ids.length
    ? await Promise.all([
        db
          .select({
            raiz: sql<string>`coalesce(${produtos.paiId}, ${produtos.id})`,
            marketplace: anuncios.marketplace,
            contaId: anuncios.contaId,
            idExterno: anuncios.idExterno,
            visitas: anuncios.visitas,
            curtidas: anuncios.curtidas,
            criadoEm: anuncios.criadoEm,
          })
          .from(anuncios)
          .innerJoin(produtos, eq(produtos.id, anuncios.produtoId))
          .where(and(eq(anuncios.status, "publicado"), or(inArray(produtos.id, ids), inArray(produtos.paiId, ids)))),
        db
          .select({ contaId: pedidosMarketplace.contaId, marketplace: pedidosMarketplace.marketplace, status: pedidosMarketplace.status, taxas: pedidosMarketplace.taxas, frete: pedidosMarketplace.freteVendedor, itens: pedidosMarketplace.itens })
          .from(pedidosMarketplace)
          .where(and(gte(pedidosMarketplace.data, new Date(Date.now() - 30 * 86400_000)), isNotNull(pedidosMarketplace.contaId))),
      ])
    : [[], []];
  const desempenho = new Map<string, Partial<Record<Marketplace, Desempenho>>>();
  // Desde quando o produto está anunciado (o anúncio mais antigo): conta os 30 dias de teste.
  const anunciadoDesde = new Map<string, Date>();
  for (const a of publicados) {
    const antes = anunciadoDesde.get(a.raiz);
    if (!antes || a.criadoEm < antes) anunciadoDesde.set(a.raiz, a.criadoEm);
    const porCanal = desempenho.get(a.raiz) ?? {};
    const d = (porCanal[a.marketplace] ??= { visitas: 0, curtidas: 0, vendidos: 0, vendido: 0, custos: 0 });
    d.visitas += a.visitas;
    d.curtidas += a.curtidas;
    for (const p of pedidos30) {
      if (p.contaId !== a.contaId || !a.idExterno || situacaoPedido(p.marketplace, p.status) === "cancelado") continue;
      const soma = p.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) || 1;
      for (const i of p.itens.filter((x) => x.idAnuncio === a.idExterno)) {
        d.vendidos += i.quantidade;
        d.vendido += i.quantidade * i.valorUnitario;
        d.custos += ((p.taxas + p.frete) * i.quantidade * i.valorUnitario) / soma;
      }
    }
    desempenho.set(a.raiz, porCanal);
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo base para notas fiscais e anúncios nos marketplaces."
        actions={
          <Link href="/produtos/novo" className={buttonClass()}>
            <Plus /> Novo produto
          </Link>
        }
      />
      <div className="mb-6 flex gap-3">
        <form className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU" className="pl-9" />
          <input type="hidden" name="vista" value={vista} />
        </form>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {(
            [
              ["cards", LayoutGrid, "Cards"],
              ["grade", List, "Grade"],
            ] as const
          ).map(([v, Icon, rotulo]) => (
            <Link
              key={v}
              // Sem prefetch: a rota grava a escolha num cookie (o prefetch dos dois links sobrescreveria).
              prefetch={false}
              href={`/produtos/vista?v=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              title={rotulo}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
                vista === v ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {rotulo}
            </Link>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title={q ? "Nenhum produto encontrado" : "Catálogo vazio"}
            description={q ? "Tente outro termo." : "Cadastre suas peças impressas com custo de filamento e energia calculados automaticamente."}
            action={
              !q ? (
                <Link href="/produtos/novo" className={buttonClass("gold")}>
                  <Plus /> Cadastrar produto
                </Link>
              ) : null
            }
          />
        </Card>
      ) : vista === "grade" ? (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-14"></th>
                <th>SKU</th>
                <th>Produto</th>
                <th>Material</th>
                <th className="text-right">Custo</th>
                <th className="text-right">Preço</th>
                <th className="text-right">Margem</th>
                <th className="text-right">Estoque</th>
                <th>Anúncios</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <LinhaLink key={p.id} href={`/produtos/${p.id}`} className={p.ativo ? "" : "opacity-60"}>
                  <td>
                    <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-surface-2">
                      {p.capa ? <img src={p.capa} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted opacity-50" />}
                    </div>
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{p.sku}</td>
                  <td>
                    <Link href={`/produtos/${p.id}`} className="font-semibold hover:text-gold">
                      {p.nome}
                    </Link>
                    {!p.ativo ? <Badge tone="red" className="ml-2">Inativo</Badge> : null}
                    {p.variacoes ? <Badge tone="blue" className="ml-2">{p.variacoes} variações</Badge> : null}
                  </td>
                  <td className="text-muted">{p.material || "—"}</td>
                  <td className="text-right whitespace-nowrap text-muted">{p.custo ? formatBRL(p.custo) : "—"}</td>
                  <td className="text-right whitespace-nowrap">
                    <span className="font-semibold">{formatBRL(p.preco)}</span>
                    <PrecosPlataforma precos={p.precosCanal} padrao={p.preco} className="justify-end max-md:justify-start" />
                  </td>
                  <td className="text-right whitespace-nowrap">{p.custo && p.preco ? `${Math.round((p.preco / p.custo - 1) * 100)}%` : "—"}</td>
                  <td className={cn("text-right", p.estoque <= 0 && "font-semibold text-red")}>{p.estoque}</td>
                  <td>{p.anuncios.length ? <Bandeiras canais={p.anuncios} /> : <span className="text-muted">—</span>}</td>
                </LinhaLink>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
          {lista.map((p) => (
            <Link key={p.id} href={`/produtos/${p.id}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:-translate-y-1 group-hover:border-gold">
                <div className="relative aspect-square bg-surface-2">
                  {p.capa ? (
                    <img src={p.capa} alt="" className="size-full object-contain" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted">
                      <Package className="size-10 opacity-40" />
                    </div>
                  )}
                  {!p.ativo ? <Badge tone="red" className="absolute left-3 top-3">Inativo</Badge> : null}
                  {p.variacoes ? (
                    <Badge tone="blue" className="absolute bottom-3 left-3">
                      {p.variacoes} variações
                    </Badge>
                  ) : null}
                  {p.anuncios.length ? <Bandeiras canais={p.anuncios} className="absolute right-3 top-3" /> : null}
                </div>
                {/* Preço, preços por plataforma e estoque em linhas próprias: nada é espremido em cartão estreito (celular). */}
                <div className="grid min-w-0 gap-1 p-3 sm:p-4">
                  <p className="truncate font-mono text-[11px] text-muted sm:text-xs">{p.sku}</p>
                  <p className="line-clamp-2 text-sm font-semibold sm:text-base">{p.nome}</p>
                  <p className="mt-1 text-base font-extrabold text-primary sm:text-lg">{formatBRL(p.preco)}</p>
                  {p.anuncios.length ? (
                    <PainelRentabilidade
                      canais={p.anuncios}
                      desempenho={desempenho.get(p.id) ?? {}}
                      precos={p.precosCanal}
                      padrao={p.preco}
                      custo={p.custo}
                      desde={anunciadoDesde.get(p.id)}
                    />
                  ) : (
                    <PrecosPlataforma precos={p.precosCanal} padrao={p.preco} />
                  )}
                  <p className="flex flex-wrap gap-x-2 text-[11px] text-muted sm:text-xs">
                    {p.custo ? <span>custo {formatBRL(p.custo)}</span> : null}
                    {p.material ? <span>{p.material}</span> : null}
                    <span className={p.estoque <= 0 ? "font-semibold text-red" : ""}>{p.estoque} em estoque</span>
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** Preço de cada marketplace (quando diferente do preço da loja). */
function PrecosPlataforma({ precos, padrao, className }: { precos: Partial<Record<string, number>>; padrao: number; className?: string }) {
  const itens = (["mercadolivre", "shopee", "magalu"] as const).filter((c) => precos[c] && precos[c] !== padrao);
  if (!itens.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted", className)}>
      {itens.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 whitespace-nowrap">
          <MarcaIcone canal={c} className="size-4 p-[2px]" />
          {formatBRL(precos[c]!)}
        </span>
      ))}
    </span>
  );
}

type Desempenho = { visitas: number; curtidas: number; vendidos: number; vendido: number; custos: number };

type Veredito = { rotulo: string; dica: string; emoji: string; cor: string };

/**
 * Veredito do produto nos últimos 30 dias (para decidir se continua ou sai do catálogo): lucro = vendido − taxas −
 * frete pago − custo de produção.
 */
function veredito(t: { visitas: number; vendidos: number; lucro: number; margem: number; dias: number; semCusto: boolean }): Veredito {
  const pct = `${Math.round(t.margem * 100)}% de margem`;
  if (t.vendidos && t.lucro < 0) return { emoji: "🚨", rotulo: "Dando prejuízo", dica: "Taxa + custo maiores que o preço: suba o preço ou tire do ar.", cor: "bg-red/15 text-red ring-red/40" };
  if (t.vendidos >= 5 && t.margem >= 0.2) return { emoji: "🔥", rotulo: "Campeão", dica: `${t.vendidos} vendas e ${pct}: invista (mais estoque, anúncio, vídeo).`, cor: "bg-gold/20 text-gold ring-gold/50" };
  if (t.vendidos && t.margem >= 0.15) return { emoji: "✅", rotulo: "Rentável", dica: `Vende com ${pct}. Mantenha.`, cor: "bg-green/15 text-green ring-green/40" };
  if (t.vendidos) return { emoji: "⚠️", rotulo: "Margem baixa", dica: `Só ${pct}: a taxa está comendo o lucro. Reveja o preço.`, cor: "bg-orange-500/15 text-orange-400 ring-orange-400/40" };
  if (t.visitas >= 40) return { emoji: "👀", rotulo: "Muita visita, nenhuma venda", dica: `${t.visitas} visualizações sem compra: preço, fotos ou título não convencem.`, cor: "bg-primary/15 text-primary ring-primary/40" };
  if (t.dias >= 30) return { emoji: "💤", rotulo: "Parado há 30 dias", dica: "Sem vendas no período de teste: candidato a sair do catálogo.", cor: "bg-red/10 text-red ring-red/30" };
  return { emoji: "🧪", rotulo: `Em teste · dia ${Math.max(1, t.dias)} de 30`, dica: t.semCusto ? "Cadastre o custo para calcular o lucro." : "Ainda sem vendas: acompanhe as visualizações.", cor: "bg-surface-2 text-muted ring-border" };
}

/**
 * Painel do card: veredito de rentabilidade (cores), uma linha por plataforma (preço, visualizações, vendas e taxa) e o
 * lucro dos últimos 30 dias.
 */
function PainelRentabilidade({
  canais,
  desempenho,
  precos,
  padrao,
  custo,
  desde,
}: {
  canais: Marketplace[];
  desempenho: Partial<Record<Marketplace, Desempenho>>;
  precos: Partial<Record<string, number>>;
  padrao: number;
  custo: number;
  desde?: Date;
}) {
  const linhas = canais.map((c) => ({ c, d: desempenho[c] ?? { visitas: 0, curtidas: 0, vendidos: 0, vendido: 0, custos: 0 } }));
  // O Magalu não informa visualizações: fica fora do total (a linha dele mostra "—").
  const tot = linhas.reduce((a, { c, d }) => ({ visitas: a.visitas + (c === "magalu" ? 0 : d.visitas), vendidos: a.vendidos + d.vendidos, vendido: a.vendido + d.vendido, custos: a.custos + d.custos }), { visitas: 0, vendidos: 0, vendido: 0, custos: 0 });
  const lucro = tot.vendido - tot.custos - custo * tot.vendidos;
  const margem = tot.vendido ? lucro / tot.vendido : 0;
  const dias = desde ? Math.floor((Date.now() - desde.getTime()) / 86400_000) : 0;
  const v = veredito({ visitas: tot.visitas, vendidos: tot.vendidos, lucro, margem, dias, semCusto: !custo });
  return (
    <div className="mt-1 grid gap-1.5">
      <div className={cn("grid gap-0.5 rounded-lg px-2 py-1.5 ring-1", v.cor)}>
        <span className="flex items-center gap-1 text-xs font-extrabold sm:text-sm">
          <span aria-hidden>{v.emoji}</span> {v.rotulo}
        </span>
        <span className="text-[10px] leading-snug opacity-90 sm:text-[11px]">{v.dica}</span>
        {!tot.vendidos && dias < 30 ? (
          <span className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/20">
            <span className="block h-full rounded-full bg-current" style={{ width: `${Math.min(100, (Math.max(1, dias) / 30) * 100)}%` }} />
          </span>
        ) : null}
      </div>
      <div className="grid gap-1">
        {linhas.map(({ c, d }) => {
          const taxa = d.vendido ? Math.round((d.custos / d.vendido) * 100) : null;
          return (
            <div key={c} className="flex flex-wrap items-center gap-1 text-[11px] sm:text-xs">
              <MarcaIcone canal={c} className="size-5 p-[2px]" />
              <span className="mr-auto whitespace-nowrap font-semibold">{formatBRL(precos[c] || padrao)}</span>
              <span
                className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", c === "magalu" ? "bg-surface-2 text-muted" : d.visitas ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted")}
                title={c === "magalu" ? "O Magalu não informa visualizações" : "Visualizações"}
              >
                <Eye className="size-3" /> {c === "magalu" ? "—" : d.visitas.toLocaleString("pt-BR")}
              </span>
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", d.vendidos ? "bg-green/15 text-green" : "bg-surface-2 text-muted")} title="Vendas nos últimos 30 dias">
                <ShoppingCart className="size-3" /> {d.vendidos}
              </span>
              {taxa !== null ? (
                <span className="rounded-full bg-red/15 px-1.5 py-0.5 font-semibold text-red" title={`Taxas e frete: ${formatBRL(d.custos)}`}>
                  -{taxa}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">Lucro 30 dias</span>
        <span className={cn("text-sm font-extrabold sm:text-base", tot.vendidos ? (lucro >= 0 ? "text-green" : "text-red") : "text-muted")}>
          {tot.vendidos ? `${lucro < 0 ? "-" : ""}${formatBRL(Math.abs(lucro))}` : "—"}
          {tot.vendidos ? <span className="ml-1 text-[10px] font-semibold opacity-80">({Math.round(margem * 100)}%)</span> : null}
        </span>
      </div>
    </div>
  );
}

/** Uma bandeirinha (ícone da marca) para cada marketplace onde o produto está anunciado. */
function Bandeiras({ canais, className }: { canais: Marketplace[]; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {canais.map((c) => (
        <MarcaIcone key={c} canal={c} className="size-7" />
      ))}
    </span>
  );
}
