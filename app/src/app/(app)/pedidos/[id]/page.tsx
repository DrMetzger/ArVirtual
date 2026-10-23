import { eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, FileCheck2, FileText, MapPin, Package, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { linkPedido, situacaoPedido, SITUACOES } from "@/lib/marketplaces/situacao";
import { clienteDoPedido, documentoDoPedido, vincularItens } from "@/lib/pedidos";
import { formatBRL, formatCep, formatDate, formatDocumento, formatTelefone } from "@/lib/utils";
import { faturarPedido } from "../actions";

export const metadata: Metadata = { title: "Pedido" };

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) notFound();
  const [conta, itens, cliente] = await Promise.all([
    db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId), columns: { nome: true } }),
    vincularItens(pedido),
    clienteDoPedido(pedido),
  ]);
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const info = MARKETPLACE_INFO[pedido.marketplace];
  const e = pedido.entrega;
  const doc = documentoDoPedido(pedido);
  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const semProduto = itens.filter((i) => !i.produto).length;
  const podeFaturar = situacao !== "cancelado" && situacao !== "aguardando";

  return (
    <>
      <Link href="/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Pedidos
      </Link>
      <PageHeader
        title={`Pedido ${pedido.idExterno}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: info.cor }} />
            {info.nome} · {conta?.nome} · {formatDate(pedido.data)}
            <Badge tone={SITUACOES[situacao].tom}>{SITUACOES[situacao].nome}</Badge>
            <span className="font-mono text-xs">({pedido.status})</span>
          </span>
        }
        actions={
          <>
            <a href={linkPedido(pedido.marketplace, pedido.idExterno)} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
              <ExternalLink /> Abrir no {info.nome}
            </a>
            {pedido.notaId ? (
              <Link href={`/notas/${pedido.notaId}`} className={buttonClass("primary")}>
                <FileCheck2 /> Ver nota fiscal
              </Link>
            ) : (
              <form action={faturarPedido.bind(null, pedido.id)}>
                <SubmitButton variant="gold" pendingText="Preparando..." disabled={!podeFaturar}>
                  <FileText /> Emitir NF-e
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          {!podeFaturar && !pedido.notaId ? (
            <Alert tone="gold">
              {situacao === "cancelado" ? "Pedido cancelado: não há nota a emitir." : "Aguardando pagamento: a nota fica disponível quando o pedido for pago."}
            </Alert>
          ) : null}
          {semProduto && podeFaturar ? (
            <Alert tone="gold">
              {semProduto} item(ns) não ligado(s) a um produto do cadastro. Use o mesmo SKU do anúncio no produto (ou publique pelo sistema) para a nota sair
              preenchida.
            </Alert>
          ) : null}

          <Card>
            <CardHeader title="Itens" description={`${itens.reduce((s, i) => s + i.quantidade, 0)} unidade(s)`} />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Unitário</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i, n) => (
                    <tr key={n}>
                      <td>
                        <p className="font-medium">{i.titulo}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {i.sku ? <>SKU {i.sku} · </> : null}anúncio {i.idAnuncio || "—"}
                        </p>
                        {i.produto ? (
                          <Link href={`/produtos/${i.produto.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green">
                            <Package className="size-3.5" /> {i.produto.nome}
                          </Link>
                        ) : (
                          <Badge tone="gold" className="mt-1">
                            sem produto no cadastro
                          </Badge>
                        )}
                      </td>
                      <td className="text-right">{i.quantidade}</td>
                      <td className="text-right whitespace-nowrap">{formatBRL(i.valorUnitario)}</td>
                      <td className="text-right font-semibold whitespace-nowrap">{formatBRL(i.quantidade * i.valorUnitario)}</td>
                    </tr>
                  ))}
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted">
                        O marketplace não enviou os itens deste pedido. Sincronize de novo para atualizar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <details>
              <summary className="cursor-pointer p-5 text-sm font-semibold text-muted hover:text-gold">Dados originais do {info.nome}</summary>
              <pre className="max-h-96 overflow-auto border-t border-border p-5 text-xs">{JSON.stringify(pedido.dados, null, 2)}</pre>
            </details>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Valores" />
            <dl className="grid gap-2 p-5 text-sm">
              <Linha nome="Produtos" valor={formatBRL(subtotal)} />
              <Linha nome="Frete" valor={formatBRL(pedido.frete)} />
              <div className="mt-1 flex justify-between border-t border-border pt-3 text-base font-bold">
                <dt>Total do pedido</dt>
                <dd>{formatBRL(pedido.total)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><User className="size-4 text-gold" /> Comprador</span>} />
            <div className="grid gap-1 p-5 text-sm">
              <p className="font-semibold">{e?.nome || pedido.comprador || "—"}</p>
              {doc ? <p className="text-muted">{formatDocumento(doc)}</p> : <p className="text-xs text-muted">CPF/CNPJ não informado pelo marketplace.</p>}
              {e?.telefone ? <p className="text-muted">{formatTelefone(e.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""))}</p> : null}
              {cliente ? (
                <Link href={`/clientes/${cliente.id}`} className="mt-2 text-xs font-semibold text-green">
                  Cliente cadastrado →
                </Link>
              ) : doc ? (
                <p className="mt-2 text-xs text-muted">Será cadastrado como cliente ao emitir a NF-e.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><MapPin className="size-4 text-gold" /> Entrega</span>} />
            <div className="grid gap-1 p-5 text-sm">
              {e ? (
                <>
                  <p>{e.endereco}</p>
                  <p className="text-muted">
                    {e.cidade}
                    {e.uf ? ` / ${e.uf}` : ""}
                    {e.cep ? ` · CEP ${formatCep(e.cep)}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted">Endereço não informado pelo marketplace.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Linha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{nome}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
