import { and, asc, eq } from "drizzle-orm";
import { CANAIS, MarcaLogo } from "@/components/marca";
import { ArrowLeft, ExternalLink, FileCheck2, FileText, MapPin, Package, RefreshCw, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { contasMarketplace, notas, pedidosMarketplace, produtos } from "@/db/schema";
import { notaVale } from "@/lib/nota-pedido";
import { StatusNota } from "../../notas/status";
import { requireUser } from "@/lib/auth";
import { linkPedido, numeroPedido, packMercadoLivre, situacaoPedido, SITUACOES, type Situacao } from "@/lib/marketplaces/situacao";
import { clienteDoPedido, documentoDoPedido, vincularItens } from "@/lib/pedidos";
import { formatBRL, formatCep, formatDate, formatDocumento, formatTelefone } from "@/lib/utils";
import { alterarSituacao, buscarNotaDoPedido, faturarPedido } from "../actions";
import { notasDosPedidos } from "@/lib/marketplaces/notas-externas";
import { MAGALU_SEM_NOTA } from "@/lib/marketplaces/situacao";
import { Vincular } from "./vincular";

export const metadata: Metadata = { title: "Pedido" };

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const msg = await searchParams;
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) notFound();
  const [conta, itens, cliente, listaProdutos, nota] = await Promise.all([
    pedido.contaId ? db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId), columns: { nome: true } }) : undefined,
    vincularItens(pedido),
    clienteDoPedido(pedido),
    db.select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku }).from(produtos).where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false))).orderBy(asc(produtos.nome)),
    pedido.notaId ? db.query.notas.findFirst({ where: eq(notas.id, pedido.notaId), columns: { id: true, status: true, numero: true } }) : undefined,
  ]);
  const notaValida = nota && notaVale(nota.status) ? nota : null;
  const externas = await notasDosPedidos([pedido.id]);
  const externaValida = externas.find((n) => n.status !== "invalid");
  const situacao = situacaoPedido(pedido.marketplace, pedido.status);
  const info = CANAIS[pedido.marketplace];
  const pack = pedido.marketplace === "mercadolivre" ? packMercadoLivre(pedido.dados) : null;
  const link = linkPedido(pedido.marketplace, pedido.idExterno, pack);
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
            · {conta?.nome ?? "Loja própria"}{pack ? ` · pack #${pack}` : ""} · {formatDate(pedido.data)}
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
            {nota && !notaValida ? (
              <Link href={`/notas/${nota.id}`} className={buttonClass("outline")}>
                <FileCheck2 /> Nota anterior{nota.numero ? ` ${nota.numero}` : ""} <StatusNota status={nota.status} />
              </Link>
            ) : null}
            {!notaValida && externaValida ? (
              <a href={`/api/notas-externas/${externaValida.id}/danfe`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
                <FileCheck2 /> DANFE NF {externaValida.numero}
              </a>
            ) : notaValida ? (
              <Link href={`/notas/${notaValida.id}`} className={buttonClass("primary")}>
                <FileCheck2 /> Ver nota fiscal{notaValida.numero ? ` ${notaValida.numero}` : ""}
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
          {msg.ok ? <Alert tone="green">{msg.ok}</Alert> : null}
          {msg.erro ? <Alert>{msg.erro}</Alert> : null}
          {externas.length || (pedido.marketplace === "magalu" && podeFaturar && !notaValida) ? (
            <Card>
              <CardHeader
                title={<span className="inline-flex items-center gap-2"><FileCheck2 className="size-4 text-gold" /> Nota fiscal informada no {info.nome}</span>}
                description="Emitida em outro sistema e enviada ao marketplace; puxada com o XML."
                action={
                  <form action={buscarNotaDoPedido.bind(null, pedido.id)}>
                    <SubmitButton variant="outline" size="sm" pendingText="Buscando...">
                      <RefreshCw /> {externas.length ? "Atualizar" : "Buscar nota"}
                    </SubmitButton>
                  </form>
                }
              />
              {externas.length ? (
                <div className="divide-y divide-border">
                  {externas.map((n) => (
                    <div key={n.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
                      <div>
                        <p className="font-semibold">NF {n.numero} · série {n.serie}</p>
                        <p className="font-mono text-xs break-all text-muted">{n.chave.replace(/(\d{4})(?=\d)/g, "$1 ")}</p>
                      </div>
                      <div className="text-xs text-muted">
                        {n.emitidaEm ? `Emitida ${formatDate(n.emitidaEm)}` : null}
                        {n.valor ? <span className="block font-semibold text-foreground">{formatBRL(n.valor)}</span> : null}
                      </div>
                      <Badge tone={n.status === "invalid" ? "red" : n.status === "validating" ? "gold" : "green"}>
                        {n.status === "invalid" ? "Inválida no marketplace" : n.status === "validating" ? "Em validação" : "Aprovada"}
                      </Badge>
                      <div className="ml-auto flex gap-2">
                        {n.xml ? (
                          <>
                            <a href={`/api/notas-externas/${n.id}/danfe`} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
                              DANFE
                            </a>
                            <a href={`/api/notas-externas/${n.id}/xml`} className={buttonClass("outline", "sm")}>
                              XML
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-4 text-sm text-muted">{MAGALU_SEM_NOTA}</p>
              )}
            </Card>
          ) : null}
          {nota && !notaValida && podeFaturar ? (
            <Alert tone="gold">A nota deste pedido foi {nota.status === "cancelada" ? "cancelada" : nota.status}. Você pode emitir uma nova NF-e.</Alert>
          ) : null}
          {!podeFaturar && !notaValida ? (
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
