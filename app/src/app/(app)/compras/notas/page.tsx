import { desc, eq } from "drizzle-orm";
import { FileInput, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { fornecedores, notasEntrada } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { STATUS_ENTRADA } from "@/lib/status-entrada";
import { formatBRL, formatDate } from "@/lib/utils";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Notas de entrada" };

export default async function NotasEntradaPage() {
  await requireUser();
  const lista = await db
    .select({ n: notasEntrada, fornecedor: fornecedores.nome, fantasia: fornecedores.nomeFantasia })
    .from(notasEntrada)
    .leftJoin(fornecedores, eq(fornecedores.id, notasEntrada.fornecedorId))
    .orderBy(desc(notasEntrada.entrada))
    .limit(300);
  return (
    <>
      <PageHeader
        title="Notas de entrada"
        description="Compras de filamento, embalagens e insumos. Importe o XML da NF-e: fornecedor, itens e parcelas vêm prontos."
        actions={
          <Link href="/compras/notas/nova" className={buttonClass()}>
            <Plus /> Nova entrada
          </Link>
        }
      />
      <Card>
        {lista.length === 0 ? (
          <EmptyState
            icon={<FileInput />}
            title="Nenhuma nota de entrada"
            description="Importe o XML da nota da sua última compra de filamento para dar saldo no estoque."
            action={
              <Link href="/compras/notas/nova" className={buttonClass("gold")}>
                <Plus /> Nova entrada
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Fornecedor</th>
                  <th>Emissão</th>
                  <th>Situação</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ n, fornecedor, fantasia }) => (
                  <LinhaLink key={n.id} href={`/compras/notas/${n.id}`}>
                    <td>
                      <Link href={`/compras/notas/${n.id}`} className="font-semibold hover:text-gold">
                        {n.numero ? `NF ${n.numero}${n.serie ? `/${n.serie}` : ""}` : `Entrada #${n.id}`}
                      </Link>
                      {n.chave ? <p className="text-xs text-muted">XML importado</p> : null}
                    </td>
                    <td>{fantasia || fornecedor || "—"}</td>
                    <td className="text-muted">{n.emissao ? formatDate(n.emissao) : "—"}</td>
                    <td>
                      <Badge tone={STATUS_ENTRADA[n.status].tom}>{STATUS_ENTRADA[n.status].nome}</Badge>
                    </td>
                    <td className="text-right font-semibold whitespace-nowrap">{formatBRL(n.valorTotal)}</td>
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
