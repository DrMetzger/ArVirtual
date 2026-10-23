import { eq } from "drizzle-orm";
import { ArrowLeft, Ban, Download, Mail, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { notas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import type { ItemCalculado } from "@/lib/fiscal/matriz";
import { formatBRL, formatCep, formatDate, formatDocumento } from "@/lib/utils";
import { atualizarStatus, cancelarNota, emitirNota, enviarNotaPorEmail, excluirRascunho } from "../actions";
import { StatusNota } from "../status";

export default async function NotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; aviso?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { erro, aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id), with: { cliente: true, endereco: true } });
  if (!nota) notFound();
  const itens = nota.itens as ItemCalculado[];

  return (
    <>
      <Link href="/notas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Notas fiscais
      </Link>
      <PageHeader
        title={nota.numero ? `NF-e ${nota.numero}${nota.serie ? ` · série ${nota.serie}` : ""}` : "Rascunho de NF-e"}
        description={`${nota.naturezaOperacao} · criada em ${formatDate(nota.criadoEm)}`}
        actions={
          <>
            {["rascunho", "erro"].includes(nota.status) ? (
              <>
                <form action={excluirRascunho.bind(null, id)}>
                  <SubmitButton variant="outline">
                    <Trash2 /> Excluir
                  </SubmitButton>
                </form>
                <form action={emitirNota.bind(null, id)}>
                  <SubmitButton variant="gold" pendingText="Enviando à SEFAZ...">
                    <Send /> {nota.status === "erro" ? "Reenviar" : "Emitir NF-e"}
                  </SubmitButton>
                </form>
              </>
            ) : null}
            {nota.status === "processando" || nota.status === "autorizada" ? (
              <form action={atualizarStatus.bind(null, id)}>
                <SubmitButton variant="outline" pendingText="Consultando...">
                  <RefreshCw /> Atualizar status
                </SubmitButton>
              </form>
            ) : null}
            {nota.status === "autorizada" ? (
              <>
                {nota.danfeUrl ? (
                  <a href={nota.danfeUrl} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
                    <Download /> DANFE
                  </a>
                ) : null}
                {nota.xmlUrl ? (
                  <a href={nota.xmlUrl} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
                    <Download /> XML
                  </a>
                ) : null}
                <form action={enviarNotaPorEmail.bind(null, id)}>
                  <SubmitButton pendingText="Enviando...">
                    <Mail /> Enviar ao cliente
                  </SubmitButton>
                </form>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusNota status={nota.status} />
          <Badge tone={nota.ambiente === "producao" ? "blue" : "neutral"}>{nota.ambiente === "producao" ? "Produção" : "Homologação"}</Badge>
          {nota.chave ? <span className="font-mono text-xs text-muted">Chave {nota.chave}</span> : null}
        </div>
        {erro ? <Alert>{erro}</Alert> : null}
        {aviso ? <Alert tone={aviso.startsWith("Falha") ? "red" : "green"}>{aviso}</Alert> : null}
        {nota.mensagem ? <Alert tone={nota.status === "erro" ? "red" : "blue"}>SEFAZ / Focus NFe: {nota.mensagem}</Alert> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Destinatário" />
            <div className="grid gap-1 p-5 text-sm">
              <Link href={`/clientes/${nota.cliente.id}`} className="font-semibold hover:text-gold">
                {nota.cliente.nome}
              </Link>
              <p className="text-muted">{formatDocumento(nota.cliente.documento)}</p>
              {nota.endereco ? (
                <p className="mt-2 text-muted">
                  {nota.endereco.logradouro}, {nota.endereco.numero} · {nota.endereco.bairro}
                  <br />
                  {nota.endereco.cidade}/{nota.endereco.uf} · CEP {formatCep(nota.endereco.cep)}
                </p>
              ) : (
                <p className="mt-2 text-red">Endereço removido do cadastro.</p>
              )}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Totais" />
            <div className="grid grid-cols-3 gap-4 p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Produtos</p>
                <p className="text-xl font-bold">{formatBRL(nota.totalProdutos)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Impostos destacados</p>
                <p className="text-xl font-bold">{formatBRL(nota.totalImpostos)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Total da nota</p>
                <p className="text-xl font-extrabold text-gold">{formatBRL(nota.totalNota)}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Itens" />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>NCM</th>
                  <th>CFOP</th>
                  <th>ICMS</th>
                  <th>PIS / COFINS</th>
                  <th className="text-right">Qtd × Unit.</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <tr key={idx}>
                    <td>
                      <p className="font-semibold">{i.nome}</p>
                      <p className="font-mono text-xs text-muted">{i.sku}</p>
                    </td>
                    <td className="font-mono text-xs">{i.ncm}</td>
                    <td className="font-mono text-xs">{i.cfop}</td>
                    <td className="text-xs">
                      {i.situacaoIcms}
                      {i.valorIcms ? ` · ${formatBRL(i.valorIcms)}` : ""}
                    </td>
                    <td className="text-xs">
                      {i.cstPis} / {i.cstCofins}
                    </td>
                    <td className="text-right text-xs">
                      {i.quantidade} × {formatBRL(i.valorUnitario)}
                    </td>
                    <td className="text-right font-semibold">{formatBRL(i.valorBruto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {nota.status === "autorizada" ? (
          <Card>
            <CardHeader title="Cancelar NF-e" description="Permitido em até 24 horas após a autorização, na maioria dos estados." />
            <form action={cancelarNota.bind(null, id)} className="flex flex-wrap gap-2 p-5">
              <Input name="justificativa" placeholder="Justificativa (mínimo 15 caracteres)" minLength={15} required className="flex-1" />
              <SubmitButton variant="danger" pendingText="Cancelando...">
                <Ban /> Cancelar nota
              </SubmitButton>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
