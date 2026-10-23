import { desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, notas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatBRL, formatDate } from "@/lib/utils";
import { StatusNota } from "./status";

export const metadata: Metadata = { title: "Notas fiscais" };

export default async function NotasPage() {
  await requireUser();
  const lista = await db
    .select({
      id: notas.id,
      numero: notas.numero,
      serie: notas.serie,
      status: notas.status,
      ambiente: notas.ambiente,
      total: notas.totalNota,
      criadoEm: notas.criadoEm,
      cliente: clientes.nome,
    })
    .from(notas)
    .innerJoin(clientes, eq(clientes.id, notas.clienteId))
    .orderBy(desc(notas.criadoEm))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Notas fiscais"
        description="NF-e de venda calculadas pela matriz fiscal e emitidas pela Focus NFe."
        actions={
          <Link href="/notas/nova" className={buttonClass()}>
            <Plus /> Nova nota
          </Link>
        }
      />
      <Card>
        {lista.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="Nenhuma nota ainda"
            description="Cadastre clientes, produtos e a matriz fiscal, depois monte a primeira nota."
            action={
              <Link href="/notas/nova" className={buttonClass("gold")}>
                <Plus /> Nova nota
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Link href={`/notas/${n.id}`} className="font-semibold hover:text-gold">
                        {n.numero ? `NF-e ${n.numero}${n.serie ? `/${n.serie}` : ""}` : "Rascunho"}
                      </Link>
                      {n.ambiente === "homologacao" ? <Badge className="ml-2">homologação</Badge> : null}
                    </td>
                    <td>{n.cliente}</td>
                    <td className="text-muted">{formatDate(n.criadoEm)}</td>
                    <td>
                      <StatusNota status={n.status} />
                    </td>
                    <td className="text-right font-semibold">{formatBRL(n.total)}</td>
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
