import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { filamentos, notasEntrada, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { STATUS_ENTRADA } from "@/lib/status-entrada";
import { formatBRL, formatDate, formatDocumento } from "@/lib/utils";
import { cancelarNota } from "../../actions";
import { Classificar } from "./classificar";

export const metadata: Metadata = { title: "Nota de entrada" };

export default async function NotaEntradaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const nota = await db.query.notasEntrada.findFirst({ where: eq(notasEntrada.id, id), with: { itens: true, fornecedor: true } });
  if (!nota) notFound();
  const [fils, prods] = await Promise.all([
    db.select().from(filamentos).orderBy(asc(filamentos.material), asc(filamentos.cor)),
    db.select({ id: produtos.id, nome: produtos.nome }).from(produtos).where(eq(produtos.temVariacoes, false)).orderBy(asc(produtos.nome)),
  ]);
  const st = STATUS_ENTRADA[nota.status];
  return (
    <>
      <Link href="/compras/notas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Notas de entrada
      </Link>
      <PageHeader
        title={nota.numero ? `NF ${nota.numero}${nota.serie ? `/${nota.serie}` : ""}` : `Entrada #${nota.id}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {nota.fornecedor ? (
              <Link href={`/compras/fornecedores/${nota.fornecedor.id}`} className="text-gold underline">
                {nota.fornecedor.nomeFantasia || nota.fornecedor.nome}
              </Link>
            ) : null}
            {nota.fornecedor ? <span>· {formatDocumento(nota.fornecedor.documento)}</span> : null}
            {nota.emissao ? <span>· emitida {formatDate(nota.emissao)}</span> : null}
            <Badge tone={st.tom}>{st.nome}</Badge>
          </span>
        }
        actions={
          nota.status !== "cancelada" ? (
            <form action={cancelarNota.bind(null, nota.id)}>
              <SubmitButton variant="outline" pendingText="Cancelando...">
                {nota.status === "lancada" ? "Cancelar e estornar" : "Descartar"}
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Classificar
            notaId={nota.id}
            itens={nota.itens.sort((a, b) => a.id - b.id)}
            parcelas={nota.parcelas}
            editavel={nota.status === "rascunho"}
            filamentos={fils.map((f) => ({ id: f.id, nome: `${f.material} ${f.cor}${f.marca ? ` (${f.marca})` : ""}` }))}
            produtos={prods}
          />
        </div>
        <Card className="h-fit">
          <CardHeader title="Totais" />
          <dl className="grid gap-2 p-5 text-sm">
            {[
              ["Produtos", nota.valorProdutos],
              ["Frete", nota.frete],
              ["Outras (IPI, ST, seguro...)", nota.outras],
              ["Desconto", -nota.desconto],
            ].map(([n, v]) => (
              <div key={n as string} className="flex justify-between">
                <dt className="text-muted">{n}</dt>
                <dd>{formatBRL(v as number)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-3 text-base font-bold">
              <dt>Total da nota</dt>
              <dd>{formatBRL(nota.valorTotal)}</dd>
            </div>
            {nota.chave ? <p className="mt-2 font-mono text-[10px] break-all text-muted">Chave {nota.chave}</p> : null}
            {nota.lancadaEm ? <p className="text-xs text-muted">Lançada em {formatDate(nota.lancadaEm)}</p> : null}
          </dl>
        </Card>
      </div>
    </>
  );
}
