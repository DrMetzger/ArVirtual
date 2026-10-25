import { asc, ilike, or, sql } from "drizzle-orm";
import { Plus, Search, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { fornecedores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDocumento, formatTelefone } from "@/lib/utils";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const lista = await db
    .select({
      f: fornecedores,
      notas: sql<number>`(select count(*)::int from notas_entrada n where n.fornecedor_id = "fornecedores"."id" and n.status = 'lancada')`,
      comprado: sql<number>`(select coalesce(sum(n.valor_total), 0)::float from notas_entrada n where n.fornecedor_id = "fornecedores"."id" and n.status = 'lancada')`,
    })
    .from(fornecedores)
    .where(q ? or(ilike(fornecedores.nome, `%${q}%`), ilike(fornecedores.nomeFantasia, `%${q}%`), ilike(fornecedores.documento, `%${q.replace(/\D/g, "") || q}%`)) : undefined)
    .orderBy(asc(fornecedores.nome));
  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Quem vende filamento, embalagem e insumos. A importação do XML da nota cadastra sozinho."
        actions={
          <Link href="/compras/fornecedores/novo" className={buttonClass()}>
            <Plus /> Novo fornecedor
          </Link>
        }
      />
      <Card>
        <form className="relative border-b border-border p-4">
          <Search className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Buscar por nome ou CNPJ" className="pl-9" />
        </form>
        {lista.length === 0 ? (
          <EmptyState icon={<Truck />} title="Nenhum fornecedor" description="Importe uma nota de entrada ou cadastre o fornecedor." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>CPF/CNPJ</th>
                  <th>Contato</th>
                  <th>Cidade</th>
                  <th className="text-right">Notas</th>
                  <th className="text-right">Comprado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ f, notas, comprado }) => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/compras/fornecedores/${f.id}`} className="font-semibold hover:text-gold">
                        {f.nomeFantasia || f.nome}
                      </Link>
                      {f.nomeFantasia ? <p className="text-xs text-muted">{f.nome}</p> : null}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{formatDocumento(f.documento)}</td>
                    <td className="text-sm text-muted">{[f.telefone && formatTelefone(f.telefone), f.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-muted">{f.cidade ? `${f.cidade}/${f.uf}` : "—"}</td>
                    <td className="text-right">{notas}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{comprado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
