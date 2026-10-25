import { asc, eq } from "drizzle-orm";
import { CANAIS, MarcaLogo } from "@/components/marca";
import { ArrowLeft, ExternalLink, FileCheck2, FileText, MapPin, Package, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { linkPedido, numeroPedido, situacaoPedido, SITUACOES, type Situacao } from "@/lib/marketplaces/situacao";
import { clienteDoPedido, documentoDoPedido, vincularItens } from "@/lib/pedidos";
import { formatBRL, formatCep, formatDate, formatDocumento, formatTelefone } from "@/lib/utils";
import { alterarSituacao, faturarPedido } from "../actions";
import { Vincular } from "./vincular";

export const metadata: Metadata = { title: "Pedido" };

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) notFound();
  const [conta, itens, cliente, listaProdutos] = await Promise.all([
    pedido.contaId ? db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId), columns: { nome: true } }) : undefined,
    vincularItens(pedido),
    clienteDoPedido(pedido),
    db.select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku }).from(produtos).where(eq(produtos.ativo, true)).orderBy(asc(produtos.nome)),
  ]);
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const info = CANAIS[pedido.marketplace];
  const link = linkPedido(pedido.marketplace, pedido.idExterno);
  const loja = pedido.marketplace === "loja";
  // Próximos passos de um pedido da loja própria.
  const PROXIMOS: Partial<Record<Situacao, Situacao[]>> = {
    aguardando: ["pago", "cancelado"],
    pago: ["enviado", "entregue", "cancelado"],
    enviado: ["entregue", "cancelado"],
    entregue: [],
    cancelado: ["aguardando"],
  };
  const e = pedido.entrega;
  const doc = documentoDoPedido(pedido);
  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const semProduto = itens.filter((i) => !i.produto).length;
  // Marketplace não manda o desconto separado: é a diferença entre itens + frete e o total pago.
  const desconto = pedido.desconto || Math.max(0, Math.round((subtotal + pedido.frete - pedido.total) * 100) / 100);
  const podeFaturar = situacao !== "cancelado" && situacao !== "aguardando";

  return (
    <>
      <Link href="/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Pedidos
      </Link>
      <PageHeader
        title={`Pedido ${numeroPedido(pedido.marketplace, pedido.idExterno)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <MarcaLogo canal={pedido.marketplace} className="h-5" />
            · {conta?.nome ?? "Loja própria"} · {formatDate(pedido.data)}
            <Badge tone={SITUACOES[situacao].tom}>{SITUACOES[situacao].nome}</Badge>
            {loja ? null : <span className="font-mono text-xs">({pedido.status})</span>}
          </span>
        }
        actions={
          <>
            {loja
              ? (PROXIMOS[situacao] ?? []).map((s) => (
                  <form key={s} action={alterarSituacao.bind(null, pedido.id, s)}>
                    <SubmitButton variant={s === "cancelado" ? "outline" : "primary"} pendingText="Salvando...">
                      {s === "cancelado" ? "Cancelar pedido" : `Marcar ${SITUACOES[s].nome.toLowerCase()}`}
                    </SubmitButton>
                  </form>
                ))
              : null}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
                <ExternalLink /> Abrir no {info.nome}
              </a>
            ) : null}
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
              {semProduto} item(ns) sem produto do cadastro: escolha o produto em cada item e clique em Vincular. Os próximos pedidos com o mesmo SKU já
              vêm ligados, e a nota sai com os itens.
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
                          {i.sku ? <>SKU {i.sku}</> : null}
                          {i.idAnuncio ? <> · anúncio {i.idAnuncio}</> : null}
                        </p>
                        {i.produto ? (
                          <Link href={`/produtos/${i.produto.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green">
                            <Package className="size-3.5" /> {i.produto.nome}
                          </Link>
                        ) : (
                          <Vincular pedidoId={pedido.id} chaves={[i.sku, i.idAnuncio]} produtos={listaProdutos} />
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

          {pedido.observacoes ? (
            <Card>
              <CardHeader title="Observações" />
              <p className="p-5 text-sm whitespace-pre-wrap">{pedido.observacoes}</p>
            </Card>
          ) : null}

        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Valores" />
            <dl className="grid gap-2 p-5 text-sm">
              <Linha nome="Produtos" valor={formatBRL(subtotal)} />
              {desconto > 0.009 ? <Linha nome="Desconto / cupom" valor={`− ${formatBRL(desconto)}`} /> : null}
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
              {doc ? <p className="text-muted">{formatDocumento(doc)}</p> : <p className="text-xs text-muted">{loja ? "Sem cliente cadastrado (consumidor final)." : "CPF/CNPJ não informado pelo marketplace."}</p>}
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
                <p className="text-muted">{loja ? "Sem endereço (retirada ou consumidor final)." : "Endereço não informado pelo marketplace."}</p>
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
