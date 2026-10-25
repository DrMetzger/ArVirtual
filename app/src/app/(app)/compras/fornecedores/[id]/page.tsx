import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { fornecedores, notasEntrada } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatBRL, formatDate } from "@/lib/utils";
import { FornecedorForm } from "../fornecedor-form";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Fornecedor" };

export default async function FornecedorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { salvo } = await searchParams;
  const novo = id === "novo";
  if (!novo && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const f = novo ? undefined : await db.query.fornecedores.findFirst({ where: eq(fornecedores.id, id) });
  if (!novo && !f) notFound();
  const notas = f ? await db.select().from(notasEntrada).where(eq(notasEntrada.fornecedorId, f.id)).orderBy(desc(notasEntrada.entrada)).limit(50) : [];
  return (
    <>
      <Link href="/compras/fornecedores" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Fornecedores
      </Link>
      <PageHeader title={f ? f.nomeFantasia || f.nome : "Novo fornecedor"} />
      <div className="grid gap-6">
        {salvo ? <Alert tone="green">Fornecedor salvo.</Alert> : null}
        <FornecedorForm fornecedor={f} />
        {f ? (
          <Card>
            <CardHeader title="Notas de entrada" />
            {notas.length ? (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <tbody>
                    {notas.map((n) => (
                      <LinhaLink key={n.id} href={`/compras/notas/${n.id}`}>
                        <td>
                          <Link href={`/compras/notas/${n.id}`} className="font-semibold hover:text-gold">
                            NF {n.numero || `#${n.id}`}
                          </Link>
                        </td>
                        <td className="text-muted">{formatDate(n.emissao ?? n.entrada)}</td>
                        <td className="text-muted">{n.status}</td>
                        <td className="text-right font-semibold">{formatBRL(n.valorTotal)}</td>
                      </LinhaLink>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">Nenhuma nota ainda.</p>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
