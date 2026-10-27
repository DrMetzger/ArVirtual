import { MarcaIcone } from "@/components/marca";
import { and, asc, ilike, isNull, or, sql } from "drizzle-orm";
import { LayoutGrid, List, Package, Plus, Search } from "lucide-react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { produtos, type Marketplace } from "@/db/schema";
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
      anuncios: sql<Marketplace[]>`array(select distinct a.marketplace from anuncios a where a.produto_id = "produtos"."id" and a.status = 'publicado' order by 1)`,
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
                    <PrecosPlataforma precos={p.precosCanal} padrao={p.preco} />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((p) => (
            <Link key={p.id} href={`/produtos/${p.id}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:-translate-y-1 group-hover:border-gold">
                <div className="relative aspect-[4/3] bg-surface-2">
                  {p.capa ? (
                    <img src={p.capa} alt="" className="size-full object-cover" />
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
                <div className="grid gap-1 p-4">
                  <p className="font-mono text-xs text-muted">{p.sku}</p>
                  <p className="line-clamp-2 font-semibold">{p.nome}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-extrabold text-primary">{formatBRL(p.preco)}</p>
                      <PrecosPlataforma precos={p.precosCanal} padrao={p.preco} />
                      {p.custo ? <p className="text-xs text-muted">custo {formatBRL(p.custo)}</p> : null}
                    </div>
                    <div className="text-right text-xs text-muted">
                      {p.material ? <p>{p.material}</p> : null}
                      <p className={p.estoque <= 0 ? "font-semibold text-red" : ""}>{p.estoque} em estoque</p>
                    </div>
                  </div>
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
function PrecosPlataforma({ precos, padrao }: { precos: Partial<Record<string, number>>; padrao: number }) {
  const itens = (["mercadolivre", "shopee", "magalu"] as const).filter((c) => precos[c] && precos[c] !== padrao);
  if (!itens.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11px] text-muted">
      {itens.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 whitespace-nowrap">
          <MarcaIcone canal={c} className="size-4 p-[2px]" />
          {formatBRL(precos[c]!)}
        </span>
      ))}
    </span>
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
