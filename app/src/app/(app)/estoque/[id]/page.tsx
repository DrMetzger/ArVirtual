import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { movimentosEstoque, produtos, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Movimentar } from "./movimentar";

export const metadata: Metadata = { title: "Kardex" };

const TIPO = {
  entrada: { nome: "Entrada", tom: "green" },
  saida: { nome: "Saída", tom: "red" },
  ajuste: { nome: "Contagem", tom: "blue" },
  producao: { nome: "Produção", tom: "green" },
  venda: { nome: "Venda", tom: "gold" },
  estorno: { nome: "Estorno", tom: "neutral" },
} as const;

export default async function KardexPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const produto = await db.query.produtos.findFirst({ where: eq(produtos.id, id) });
  if (!produto) notFound();
  const movs = await db
    .select({
      id: movimentosEstoque.id,
      tipo: movimentosEstoque.tipo,
      quantidade: movimentosEstoque.quantidade,
      saldo: movimentosEstoque.saldo,
      origem: movimentosEstoque.origem,
      observacao: movimentosEstoque.observacao,
      criadoEm: movimentosEstoque.criadoEm,
      usuario: usuarios.nome,
    })
    .from(movimentosEstoque)
    .leftJoin(usuarios, eq(usuarios.id, movimentosEstoque.usuarioId))
    .where(eq(movimentosEstoque.produtoId, id))
    .orderBy(desc(movimentosEstoque.criadoEm), desc(movimentosEstoque.id))
    .limit(500);

  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader
        title={produto.nome}
        description={
          <>
            SKU {produto.sku} ·{" "}
            <Link href={`/produtos/${produto.id}`} className="text-gold underline">
              ver cadastro
            </Link>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Kardex" description="Todas as movimentações, da mais recente para a mais antiga." />
          {movs.length === 0 ? (
            <EmptyState icon={<Package />} title="Sem movimentações" description="As vendas pagas e os lançamentos manuais aparecem aqui." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Saldo</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => {
                    const pedido = m.origem.match(/^pedido:(\d+)$/)?.[1];
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-muted">{formatDate(m.criadoEm)}</td>
                        <td>
                          <Badge tone={TIPO[m.tipo].tom}>{TIPO[m.tipo].nome}</Badge>
                        </td>
                        <td className={cn("text-right font-semibold", m.quantidade < 0 ? "text-red" : "text-green")}>
                          {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                        </td>
                        <td className="text-right font-semibold">{m.saldo}</td>
                        <td className="text-sm">
                          {pedido ? (
                            <Link href={`/pedidos/${pedido}`} className="text-gold underline">
                              {m.observacao}
                            </Link>
                          ) : (
                            m.observacao
                          )}
                          {m.usuario ? <span className="text-xs text-muted"> · {m.usuario.split(" ")[0]}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Movimentar produtoId={produto.id} saldo={produto.estoque} minimo={produto.estoqueMinimo} />
      </div>
    </>
  );
}
