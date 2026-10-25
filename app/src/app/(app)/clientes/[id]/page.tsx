import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, enderecos, notas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatBRL, formatDate, formatDocumento } from "@/lib/utils";
import { excluirCliente } from "../actions";
import { ClienteForm } from "../cliente-form";
import { Enderecos } from "../enderecos";
import { LinhaLink } from "@/components/linha-link";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { salvo, erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, id),
    with: { enderecos: { orderBy: [desc(enderecos.principal), asc(enderecos.apelido)] } },
  });
  if (!cliente) notFound();
  const ultimasNotas = await db.select().from(notas).where(eq(notas.clienteId, id)).orderBy(desc(notas.criadoEm)).limit(10);

  return (
    <>
      <Link href="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <PageHeader
        title={cliente.nome}
        description={`${cliente.tipo === "PJ" ? "CNPJ" : "CPF"} ${formatDocumento(cliente.documento)}`}
        actions={
          <form action={excluirCliente.bind(null, id)}>
            <button type="submit" className={buttonClass("outline", "md", "hover:border-red hover:text-red")}>
              <Trash2 /> Excluir
            </button>
          </form>
        }
      />
      <div className="grid gap-6">
        {salvo ? <Alert tone="green">Cliente salvo.</Alert> : null}
        {erro ? <Alert>{erro}</Alert> : null}
        <ClienteForm cliente={cliente} />
        <Enderecos clienteId={id} enderecos={cliente.enderecos} />
        <Card>
          <CardHeader title="Notas fiscais" />
          {ultimasNotas.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nenhuma nota emitida para este cliente.</p>
          ) : (
            <table className="table-base">
              <tbody>
                {ultimasNotas.map((n) => (
                  <LinhaLink key={n.id} href={`/notas/${n.id}`}>
                    <td>
                      <Link href={`/notas/${n.id}`} className="font-semibold hover:text-gold">
                        {n.numero ? `NF-e ${n.numero}` : "Rascunho"}
                      </Link>
                    </td>
                    <td className="text-muted">{formatDate(n.criadoEm)}</td>
                    <td>
                      <Badge>{n.status}</Badge>
                    </td>
                    <td className="text-right font-semibold">{formatBRL(n.totalNota)}</td>
                  </LinhaLink>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
