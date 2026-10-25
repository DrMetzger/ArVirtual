import { asc, eq } from "drizzle-orm";
import { Boxes, Package, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL } from "@/lib/utils";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Estoque" };

const SITUACAO = {
  zerado: { nome: "Sem estoque", tom: "red" },
  repor: { nome: "Repor", tom: "gold" },
  ok: { nome: "OK", tom: "green" },
} as const;

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  await requireUser();
  const { q = "", f } = await searchParams;
  const lista = (
    await db
      .select({
        id: produtos.id,
        sku: produtos.sku,
        nome: produtos.nome,
        estoque: produtos.estoque,
        minimo: produtos.estoqueMinimo,
        custo: produtos.custo,
        preco: produtos.preco,
        capa: produtos.imagens,
      })
      .from(produtos)
      .where(eq(produtos.ativo, true))
      .orderBy(asc(produtos.nome))
  ).map((p) => ({ ...p, situacao: (p.estoque <= 0 ? "zerado" : p.estoque <= p.minimo ? "repor" : "ok") as keyof typeof SITUACAO }));
  const busca = q.trim().toLowerCase();
  const visiveis = lista.filter(
    (p) => (!busca || p.nome.toLowerCase().includes(busca) || p.sku.toLowerCase().includes(busca)) && (!f || p.situacao === f),
  );
  const valorCusto = lista.reduce((s, p) => s + Math.max(0, p.estoque) * p.custo, 0);
  const valorVenda = lista.reduce((s, p) => s + Math.max(0, p.estoque) * p.preco, 0);
  const pecas = lista.reduce((s, p) => s + Math.max(0, p.estoque), 0);
  const repor = lista.filter((p) => p.situacao !== "ok").length;

  return (
    <>
      <PageHeader title="Estoque" description="Saldo dos produtos acabados. Vendas pagas saem sozinhas; entradas, saídas e contagens ficam no kardex de cada produto." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Peças em estoque" valor={String(pecas)} detalhe={`${lista.length} produto(s) ativo(s)`} />
        <Kpi titulo="Valor a custo" valor={formatBRL(valorCusto)} detalhe="Saldo × custo" />
        <Kpi titulo="Valor a preço de venda" valor={formatBRL(valorVenda)} detalhe="Saldo × preço" />
        <Kpi titulo="Repor" valor={String(repor)} detalhe="Sem estoque ou abaixo do mínimo" destaque={repor > 0} href="/estoque?f=repor" />
      </div>
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU" className="pl-9" />
          </div>
          {(["", "zerado", "repor", "ok"] as const).map((s) => (
            <Link
              key={s}
              href={`/estoque?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { f: s } : {}) })}`}
              className={cn(
                "flex h-10 items-center rounded-xl border px-3 text-sm font-semibold",
                (f ?? "") === s ? "border-gold text-gold" : "border-border text-muted hover:text-foreground",
              )}
            >
              {s ? SITUACAO[s].nome : "Todos"}
            </Link>
          ))}
        </form>
        {visiveis.length === 0 ? (
          <EmptyState icon={<Boxes />} title="Nada por aqui" description="Nenhum produto com esse filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-14"></th>
                  <th>Produto</th>
                  <th className="text-right">Saldo</th>
                  <th className="text-right">Mínimo</th>
                  <th>Situação</th>
                  <th className="text-right">Valor a custo</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <LinhaLink key={p.id} href={`/estoque/${p.id}`}>
                    <td>
                      <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-surface-2">
                        {p.capa[0] ? <img src={p.capa[0]} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted opacity-50" />}
                      </div>
                    </td>
                    <td>
                      <Link href={`/estoque/${p.id}`} className="font-semibold hover:text-gold">
                        {p.nome}
                      </Link>
                      <p className="font-mono text-xs text-muted">{p.sku}</p>
                    </td>
                    <td className={cn("text-right text-lg font-extrabold", p.estoque <= 0 && "text-red")}>{p.estoque}</td>
                    <td className="text-right text-muted">{p.minimo || "—"}</td>
                    <td>
                      <Badge tone={SITUACAO[p.situacao].tom}>{SITUACAO[p.situacao].nome}</Badge>
                    </td>
                    <td className="text-right whitespace-nowrap text-muted">{formatBRL(Math.max(0, p.estoque) * p.custo)}</td>
                  </LinhaLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Kpi({ titulo, valor, detalhe, destaque, href }: { titulo: string; valor: string; detalhe: string; destaque?: boolean; href?: string }) {
  const corpo = (
    <Card className={cn("p-5", destaque && "border-gold/50", href && "hover:border-gold/60")}>
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{titulo}</p>
      <p className={cn("mt-2 font-display text-2xl font-extrabold", destaque && "text-gold")}>{valor}</p>
      <p className="mt-1 text-xs text-muted">{detalhe}</p>
    </Card>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
