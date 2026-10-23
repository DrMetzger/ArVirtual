import { asc, ilike, or, sql } from "drizzle-orm";
import { Package, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const lista = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
      preco: produtos.preco,
      custo: produtos.custo,
      estoque: produtos.estoque,
      material: produtos.material,
      ativo: produtos.ativo,
      capa: sql<string | null>`${produtos.imagens}[1]`,
      // Nomes qualificados: dentro da subconsulta "id" seria a coluna de anuncios.
      anuncios: sql<number>`(select count(*)::int from anuncios a where a.produto_id = "produtos"."id" and a.status = 'publicado')`,
    })
    .from(produtos)
    .where(q ? or(ilike(produtos.nome, `%${q}%`), ilike(produtos.sku, `%${q}%`)) : undefined)
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
      <form className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU" className="pl-9" />
      </form>
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
                  {p.anuncios > 0 ? (
                    <Badge tone="gold" className="absolute right-3 top-3 bg-[#0a1a33]/80 text-[#e6c158]">
                      {p.anuncios} anúncio{p.anuncios > 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-1 p-4">
                  <p className="font-mono text-xs text-muted">{p.sku}</p>
                  <p className="line-clamp-2 font-semibold">{p.nome}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-extrabold text-primary">{formatBRL(p.preco)}</p>
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
