import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Ban, Download, FileText, Mail, PenLine, Send, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { eventosNfe, notas, pedidosMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import type { ItemCalculado } from "@/lib/fiscal/matriz";
import { FORMAS_PAGAMENTO } from "@/lib/nfe/emissor";
import { formatBRL, formatCep, formatDate, formatDocumento } from "@/lib/utils";
import { cancelarNota, corrigirNota, emitirNota, enviarNotaPorEmail, excluirRascunho, reenviarNotaMarketplace } from "../actions";
import { StatusNota } from "../status";

const TIPO_EVENTO: Record<string, string> = {
  transmissao: "Transmissão",
  consulta: "Consulta",
  cancelamento: "Cancelamento",
  cce: "Carta de correção",
};

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
  const eventos = await db
    .select({
      id: eventosNfe.id,
      tipo: eventosNfe.tipo,
      codigo: eventosNfe.codigo,
      mensagem: eventosNfe.mensagem,
      protocolo: eventosNfe.protocolo,
      sucesso: eventosNfe.sucesso,
      criadoEm: eventosNfe.criadoEm,
    })
    .from(eventosNfe)
    .where(eq(eventosNfe.notaId, id))
    .orderBy(desc(eventosNfe.criadoEm), desc(eventosNfe.id));
  const pedido = await db.query.pedidosMarketplace.findFirst({
    where: eq(pedidosMarketplace.notaId, id),
    columns: { id: true, idExterno: true, marketplace: true },
  });
  const doMagalu = pedido?.marketplace === "magalu";
  const itens = nota.itens as ItemCalculado[];
  const emitivel = ["rascunho", "rejeitada", "erro"].includes(nota.status);
  const forma = FORMAS_PAGAMENTO.find(([v]) => v === nota.formaPagamento)?.[1] ?? nota.formaPagamento;

  return (
    <>
      <Link href="/notas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Notas fiscais
      </Link>
      <PageHeader
        title={nota.numero ? `NF-e ${nota.numero} · série ${nota.serie}` : "Rascunho de NF-e"}
        description={`${nota.naturezaOperacao} · ${forma} · criada em ${formatDate(nota.criadoEm)}`}
        actions={
          <>
            {["rascunho", "rejeitada"].includes(nota.status) ? (
              <form action={excluirRascunho.bind(null, id)}>
                <SubmitButton variant="outline">
                  <Trash2 /> Excluir
                </SubmitButton>
              </form>
            ) : null}
            {emitivel ? (
              <form action={emitirNota.bind(null, id)}>
                <SubmitButton variant="gold" pendingText="Transmitindo à SEFAZ...">
                  <Send /> {nota.status === "rascunho" ? "Emitir NF-e" : nota.status === "erro" ? "Consultar e transmitir" : "Corrigir e reenviar"}
                </SubmitButton>
              </form>
            ) : null}
            {nota.xml ? (
              <a href={`/api/notas/${id}/xml`} className={buttonClass("outline")}>
                <Download /> XML
              </a>
            ) : null}
            {nota.xmlProc ? (
              <a href={`/api/notas/${id}/danfe`} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
                <FileText /> DANFE
              </a>
            ) : null}
            {nota.status === "autorizada" && doMagalu ? (
              <form action={reenviarNotaMarketplace.bind(null, id)}>
                <SubmitButton variant={nota.envioMarketplace === "enviada" ? "outline" : "gold"} pendingText="Sincronizando com o Magalu...">
                  <Upload /> Sincronizar nota no Magalu
                </SubmitButton>
              </form>
            ) : null}
            {nota.status === "autorizada" ? (
              <form action={enviarNotaPorEmail.bind(null, id)}>
                <SubmitButton pendingText="Enviando...">
                  <Mail /> Enviar ao cliente
                </SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusNota status={nota.status} />
          <Badge tone={nota.ambiente === "producao" ? "blue" : "neutral"}>{nota.ambiente === "producao" ? "Produção" : "Homologação"}</Badge>
          {nota.protocolo ? <span className="text-xs text-muted">Protocolo {nota.protocolo}</span> : null}
          {nota.chave ? <span className="font-mono text-xs text-muted">Chave {nota.chave}</span> : null}
        </div>
        {pedido ? (
          <p className="text-sm text-muted">
            Pedido{" "}
            <Link href={`/pedidos/${pedido.id}`} className="font-mono font-semibold text-foreground hover:text-gold">
              {pedido.idExterno}
            </Link>
            {doMagalu && nota.status === "autorizada" ? (
              nota.envioMarketplace === "enviada" ? (
                <span className="ml-2 font-semibold text-green">· nota já informada no Magalu</span>
              ) : (
                <span className="ml-2 font-semibold text-gold">· nota ainda não informada no Magalu{nota.envioMarketplace ? ` (${nota.envioMarketplace})` : ""}</span>
              )
            ) : null}
          </p>
        ) : null}
        {erro ? <Alert>{erro}</Alert> : null}
        {aviso ? <Alert tone="green">{aviso}</Alert> : null}
        {nota.mensagem ? (
          <Alert tone={nota.status === "autorizada" ? "green" : nota.status === "cancelada" ? "blue" : nota.status === "erro" ? "gold" : "red"}>
            SEFAZ{nota.codigoSefaz ? ` ${nota.codigoSefaz}` : ""}: {nota.mensagem}
          </Alert>
        ) : null}

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
                <p className="text-xs uppercase tracking-wide text-muted">Impostos</p>
                <p className="text-xl font-bold">{formatBRL(nota.totalImpostos)}</p>
              </div>
              {nota.frete || nota.desconto ? (
                <p className="order-last col-span-3 -mt-1 text-xs text-muted">
                  {nota.frete ? `Frete cobrado do comprador: ${formatBRL(nota.frete)}` : ""}
                  {nota.frete && nota.desconto ? " · " : ""}
                  {nota.desconto ? `Desconto: − ${formatBRL(nota.desconto)}` : ""}
                </p>
              ) : null}
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
                      {i.taxes.icms.cst}
                      {i.taxes.icms.value ? ` · ${formatBRL(i.taxes.icms.value)}` : ""}
                      {i.taxes.difal ? <p className="text-muted">DIFAL {formatBRL(i.taxes.difal.value + i.taxes.difal.fcpValue)}</p> : null}
                    </td>
                    <td className="text-xs">
                      {i.taxes.pis.cst} / {i.taxes.cofins.cst}
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
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Carta de correção" description="Corrige dados que não alteram valores, impostos, destinatário ou data." />
              <form action={corrigirNota.bind(null, id)} className="flex flex-wrap gap-2 p-5">
                <Input name="correcao" placeholder="Texto da correção (mínimo 15 caracteres)" minLength={15} required className="flex-1" />
                <SubmitButton variant="outline" pendingText="Enviando...">
                  <PenLine /> Registrar
                </SubmitButton>
              </form>
            </Card>
            <Card>
              <CardHeader title="Cancelar NF-e" description="Permitido em até 24 horas após a autorização, na maioria dos estados." />
              <form action={cancelarNota.bind(null, id)} className="flex flex-wrap gap-2 p-5">
                <Input name="justificativa" placeholder="Justificativa (mínimo 15 caracteres)" minLength={15} required className="flex-1" />
                <SubmitButton variant="danger" pendingText="Cancelando...">
                  <Ban /> Cancelar nota
                </SubmitButton>
              </form>
            </Card>
          </div>
        ) : null}

        <Card>
          <CardHeader title="Histórico na SEFAZ" description="Cada ida à SEFAZ fica registrada, com a resposta recebida." />
          {eventos.length === 0 ? (
            <p className="p-5 text-sm text-muted">Esta nota ainda não foi transmitida.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-xs text-muted">{formatDate(e.criadoEm)}</td>
                      <td className="whitespace-nowrap font-semibold">{TIPO_EVENTO[e.tipo] ?? e.tipo}</td>
                      <td>
                        <Badge tone={e.sucesso ? "green" : "red"}>{e.codigo ?? "—"}</Badge>
                      </td>
                      <td className="text-sm">
                        {e.mensagem}
                        {e.protocolo ? <span className="ml-2 text-xs text-muted">Prot. {e.protocolo}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
