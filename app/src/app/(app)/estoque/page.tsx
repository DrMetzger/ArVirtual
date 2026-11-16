import { and, asc, eq, sql } from "drizzle-orm";
import { listaCategorias } from "@/lib/categorias";
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

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; cat?: string }>;
}) {
  await requireUser();
  const { q = "", f, cat = "" } = await searchParams;
  const cats = await listaCategorias();
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
        // A variação usa a categoria do produto principal.
        categoriaId: sql<
          number | null
        >`coalesce("produtos"."categoria_id", (select pai.categoria_id from produtos pai where pai.id = "produtos"."pai_id"))`,
      })
      .from(produtos)
      .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false)))
      .orderBy(asc(produtos.nome))
  ).map((p) => ({
    ...p,
    cat: p.categoriaId === null ? "sem" : String(p.categoriaId),
    situacao: (p.estoque <= 0
      ? "zerado"
      : p.estoque <= p.minimo
        ? "repor"
        : "ok") as keyof typeof SITUACAO,
  }));
  const busca = q.trim().toLowerCase();
  const visiveis = lista.filter(
    (p) =>
      (!busca ||
        p.nome.toLowerCase().includes(busca) ||
        p.sku.toLowerCase().includes(busca)) &&
      (!f || p.situacao === f),
  );
  const grupos = [
    ...cats.map((c) => ({ id: String(c.id), nome: c.nome })),
    { id: "sem", nome: "Sem categoria" },
  ];
  const secoes = grupos
    .map((g) => ({
      ...g,
      itens: visiveis.filter((p) => p.cat === g.id && (!cat || cat === g.id)),
    }))
    .filter((g) => g.itens.length);
  const linkCat = (c: string) =>
    `/estoque?${new URLSearchParams({ ...(q ? { q } : {}), ...(f ? { f } : {}), ...(c ? { cat: c } : {}) })}`;
  const valorCusto = lista.reduce(
    (s, p) => s + Math.max(0, p.estoque) * p.custo,
    0,
  );
  const valorVenda = lista.reduce(
    (s, p) => s + Math.max(0, p.estoque) * p.preco,
    0,
  );
  const pecas = lista.reduce((s, p) => s + Math.max(0, p.estoque), 0);
  const repor = lista.filter((p) => p.situacao !== "ok").length;

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo dos produtos acabados. Vendas pagas saem sozinhas; entradas, saídas e contagens ficam no kardex de cada produto."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          titulo="Peças em estoque"
          valor={String(pecas)}
          detalhe={`${lista.length} produto(s) ativo(s)`}
        />
        <Kpi
          titulo="Valor a custo"
          valor={formatBRL(valorCusto)}
          detalhe="Saldo × custo"
        />
        <Kpi
          titulo="Valor a preço de venda"
          valor={formatBRL(valorVenda)}
          detalhe="Saldo × preço"
        />
        <Kpi
          titulo="Repor"
          valor={String(repor)}
          detalhe="Sem estoque ou abaixo do mínimo"
          destaque={repor > 0}
          href="/estoque?f=repor"
        />
      </div>
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome ou SKU"
              className="pl-9"
            />
          </div>
          {(["", "zerado", "repor", "ok"] as const).map((s) => (
            <Link
              key={s}
              href={`/estoque?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { f: s } : {}), ...(cat ? { cat } : {}) })}`}
              className={cn(
                "flex h-10 items-center rounded-xl border px-3 text-sm font-semibold",
                (f ?? "") === s
                  ? "border-gold text-gold"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {s ? SITUACAO[s].nome : "Todos"}
            </Link>
          ))}
          {cat ? <input type="hidden" name="cat" value={cat} /> : null}
          {f ? <input type="hidden" name="f" value={f} /> : null}
        </form>
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {[{ id: "", nome: "Todas" }, ...grupos]
            .filter(
              (g) =>
                !g.id || g.id === cat || visiveis.some((p) => p.cat === g.id),
            )
            .map((g) => (
              <Link
                key={g.id || "todas"}
                href={linkCat(g.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold",
                  cat === g.id
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                {g.nome}{" "}
                <span className="opacity-70">
                  {g.id
                    ? visiveis.filter((p) => p.cat === g.id).length
                    : visiveis.length}
                </span>
              </Link>
            ))}
        </div>
        {secoes.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title="Nada por aqui"
            description="Nenhum produto com esse filtro."
          />
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
              {secoes.map((sec) => (
                <tbody key={sec.id}>
                  <tr>
                    <td
                      colSpan={6}
                      className="bg-surface-2 !py-2 text-xs font-bold tracking-wide text-muted uppercase"
                    >
                      {sec.nome}{" "}
                      <span className="font-normal normal-case">
                        · {sec.itens.length}
                      </span>
                    </td>
                  </tr>
                  {sec.itens.map((p) => (
                    <LinhaLink key={p.id} href={`/estoque/${p.id}`}>
                      <td>
                        <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-surface-2">
                          {p.capa[0] ? (
                            <img
                              src={p.capa[0]}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Package className="size-5 text-muted opacity-50" />
                          )}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/estoque/${p.id}`}
                          className="font-semibold hover:text-gold"
                        >
                          {p.nome}
                        </Link>
                        <p className="font-mono text-xs text-muted">{p.sku}</p>
                      </td>
                      <td
                        className={cn(
                          "text-right text-lg font-extrabold",
                          p.estoque <= 0 && "text-red",
                        )}
                      >
                        {p.estoque}
                      </td>
                      <td className="text-right text-muted">
                        {p.minimo || "—"}
                      </td>
                      <td>
                        <Badge tone={SITUACAO[p.situacao].tom}>
                          {SITUACAO[p.situacao].nome}
                        </Badge>
                      </td>
                      <td className="text-right whitespace-nowrap text-muted">
                        {formatBRL(Math.max(0, p.estoque) * p.custo)}
                      </td>
                    </LinhaLink>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Kpi({
  titulo,
  valor,
  detalhe,
  destaque,
  href,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  href?: string;
}) {
  const corpo = (
    <Card
      className={cn(
        "p-4 sm:p-5",
        destaque && "border-gold/50",
        href && "hover:border-gold/60",
      )}
    >
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">
        {titulo}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl",
          destaque && "text-gold",
        )}
      >
        {valor}
      </p>
      <p className="mt-1 text-xs text-muted">{detalhe}</p>
    </Card>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
