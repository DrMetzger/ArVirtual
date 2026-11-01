import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { MarcaIcone } from "@/components/marca";
import { ArrowLeft, Copy, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { anuncios, arquivosProduto, contasMarketplace, pedidosMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { geminiConfigurado } from "@/lib/gemini";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import { listaFilamentos } from "@/lib/filamentos";
import { getParametrosImpressao, getParametrosPreco, getSettings } from "@/lib/settings";
import { formatBRL, formatDate } from "@/lib/utils";
import { duplicarProduto, excluirProduto } from "../actions";
import { Anunciar } from "../anunciar";
import { ArquivosImpressao } from "../arquivos-impressao";
import { ProdutoForm } from "../produto-form";

export default async function ProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; copia?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { salvo, copia } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const produto = await db.query.produtos.findFirst({ where: eq(produtos.id, id) });
  if (!produto) notFound();
  // Variação é editada no produto principal.
  if (produto.paiId) redirect(`/produtos/${produto.paiId}`);
  const variacoes = produto.temVariacoes ? await db.select().from(produtos).where(eq(produtos.paiId, id)).orderBy(asc(produtos.cor)) : [];

  const cfgMl = await getSettings(["mercadolivre.tipoAnuncio", "mercadolivre.freteGratis"]);
  const [contas, historico, parametros, ia, precos, arquivos, anunciadas, todosPublicados] = await Promise.all([
    db.select().from(contasMarketplace).orderBy(contasMarketplace.marketplace),
    // Histórico do produto e das variações dele.
    db.query.anuncios.findMany({
      where: inArray(anuncios.produtoId, [id, ...variacoes.map((v) => v.id)]),
      with: { conta: true },
      orderBy: desc(anuncios.criadoEm),
      limit: 20,
    }),
    getParametrosImpressao(),
    geminiConfigurado(),
    getParametrosPreco(),
    db.select().from(arquivosProduto).where(eq(arquivosProduto.produtoId, id)).orderBy(desc(arquivosProduto.criadoEm)),
    // Onde cada variação já está anunciada (para não publicar em dobro).
    variacoes.length
      ? db
          .select({ produtoId: anuncios.produtoId, contaId: anuncios.contaId })
          .from(anuncios)
          .where(and(inArray(anuncios.produtoId, variacoes.map((v) => v.id)), eq(anuncios.status, "publicado")))
      : Promise.resolve([] as { produtoId: string; contaId: number }[]),
    // Anúncios existentes do produto e das variações, por conta (para "Atualizar anúncios").
    db
      .select({ contaId: anuncios.contaId, idExterno: anuncios.idExterno })
      .from(anuncios)
      .where(and(inArray(anuncios.produtoId, [id, ...variacoes.map((v) => v.id)]), eq(anuncios.status, "publicado"), isNotNull(anuncios.idExterno))),
  ]);
  // Desempenho dos anúncios publicados: visualizações (API) e vendas/taxas dos pedidos dos últimos 90 dias.
  const publicados = historico.filter((a) => a.status === "publicado" && a.idExterno);
  const pedidosDoProduto = publicados.length
    ? await db
        .select({ contaId: pedidosMarketplace.contaId, marketplace: pedidosMarketplace.marketplace, status: pedidosMarketplace.status, total: pedidosMarketplace.total, taxas: pedidosMarketplace.taxas, frete: pedidosMarketplace.freteVendedor, itens: pedidosMarketplace.itens })
        .from(pedidosMarketplace)
        .where(
          and(
            gte(pedidosMarketplace.data, new Date(Date.now() - 90 * 86400_000)),
            or(...publicados.map((a) => sql`${pedidosMarketplace.itens} @> ${JSON.stringify([{ idAnuncio: a.idExterno }])}::jsonb`)),
          ),
        )
    : [];
  const desempenho = publicados.map((a) => {
    let vendidos = 0;
    let vendido = 0;
    let taxas = 0;
    let frete = 0;
    for (const p of pedidosDoProduto) {
      if (p.contaId !== a.contaId || situacaoPedido(p.marketplace, p.status) === "cancelado") continue;
      const somaItens = p.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) || 1;
      for (const i of p.itens.filter((x) => x.idAnuncio === a.idExterno)) {
        const parte = (i.quantidade * i.valorUnitario) / somaItens;
        vendidos += i.quantidade;
        vendido += i.quantidade * i.valorUnitario;
        taxas += p.taxas * parte;
        frete += p.frete * parte;
      }
    }
    return { id: a.id, marketplace: a.marketplace, conta: a.conta.nome, visitas: a.visitas, curtidas: a.curtidas, vendidos, vendido, taxas, frete };
  });

  return (
    <>
      <Link href="/produtos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Produtos
      </Link>
      <PageHeader
        title={produto.nome}
        description={`SKU ${produto.sku} · NCM ${produto.ncm}${variacoes.length ? ` · ${variacoes.filter((v) => v.ativo).length} variação(ões)` : ""}`}
        actions={
          <>
            <form action={duplicarProduto.bind(null, id)}>
              <SubmitButton variant="outline" pendingText="Copiando..." title="Cria outro produto igual (SKU novo, estoque zero, sem anúncios) para anunciar de outro jeito">
                <Copy /> Duplicar
              </SubmitButton>
            </form>
            <form action={excluirProduto.bind(null, id)}>
              <button type="submit" className={buttonClass("outline", "md", "hover:border-red hover:text-red")}>
                <Trash2 /> Excluir
              </button>
            </form>
          </>
        }
      />
      <div className="grid gap-6">
        {salvo ? <Alert tone="green">Produto salvo.</Alert> : null}
        {copia ? (
          <Alert tone="green">
            Cópia criada com SKU {produto.sku}, estoque zero e sem anúncios. Ajuste o nome, o SKU e os preços e clique em Salvar alterações.
          </Alert>
        ) : null}
        {/* key: depois de salvar, o formulário recomeça com as mídias já gravadas (sem repetir os arquivos novos). */}
        <ProdutoForm
          key={[...produto.imagens, ...produto.videos, ...variacoes.map((v) => `${v.id}${v.estoque}`)].join("|")}
          variacoes={variacoes.map((v) => ({
            id: v.id, sku: v.sku, cor: v.cor, material: v.material, filamentoId: v.filamentoId, preco: v.preco, gtin: v.gtin, estoque: v.estoque, ativo: v.ativo,
            // Antes, a variação copiava as fotos do produto: essas não contam como fotos dela.
            imagens: v.imagens.join() === produto.imagens.join() ? [] : v.imagens,
            tipo: Object.keys(v.atributos ?? {}).find((k) => k !== "Material") ?? "Cor",
          }))}
          produto={produto} parametros={parametros} precos={precos} filamentos={await listaFilamentos()} />
        <ArquivosImpressao
          produtoId={id}
          iniciais={arquivos.map((a) => ({ id: a.id, nome: a.nome, tamanho: a.tamanho, observacao: a.observacao, enviadoPor: a.enviadoPor, criadoEm: a.criadoEm }))}
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <Anunciar
            produtoId={id}
            nome={produto.nome}
            descricao={produto.descricao}
            preco={produto.preco}
            precosCanal={produto.precosCanal}
            ml={{ tipo: cfgMl["mercadolivre.tipoAnuncio"] || "classico", frete: cfgMl["mercadolivre.freteGratis"] || "automatico" }}
            temImagem={produto.imagens.length > 0}
            iaConfigurada={ia}
            contas={contas.map((c) => ({
              id: c.id,
              nome: c.nome,
              marketplace: c.marketplace,
              marketplaceNome: MARKETPLACE_INFO[c.marketplace].nome,
              cor: MARKETPLACE_INFO[c.marketplace].cor,
            }))}
            existentes={Object.entries(
              todosPublicados.reduce<Record<number, Set<string>>>((acc, a) => ((acc[a.contaId] ??= new Set()).add(a.idExterno ?? ""), acc), {}),
            ).map(([contaId, ids]) => ({ contaId: Number(contaId), quantidade: ids.size }))}
            variacoes={variacoes
              .filter((v) => v.ativo)
              .map((v) => ({
                id: v.id,
                rotulo: v.cor || v.sku,
                sku: v.sku,
                imagem: v.imagens[0],
                contas: anunciadas.filter((a) => a.produtoId === v.id).map((a) => a.contaId),
              }))}
            pendentes={(Object.keys(MARKETPLACE_INFO) as (keyof typeof MARKETPLACE_INFO)[])
              .filter((mp) => !contas.some((c) => c.marketplace === mp))
              .map((mp) => ({ marketplace: mp, nome: MARKETPLACE_INFO[mp].nome, cor: MARKETPLACE_INFO[mp].cor }))}
          />
          {desempenho.length ? (
            <Card>
              <CardHeader
                title="Desempenho nos marketplaces"
                description="Visualizações e curtidas vêm das APIs (Magalu não informa); vendas e taxas, dos pedidos dos últimos 90 dias. A taxa do pedido é dividida pelos itens dele."
              />
              <div className="grid divide-y divide-border">
                {desempenho.map((d) => (
                  <div key={d.id} className="grid gap-2 px-5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <MarcaIcone canal={d.marketplace} />
                      <span className="font-semibold">{MARKETPLACE_INFO[d.marketplace].nome}</span>
                      <span className="truncate text-xs text-muted">{d.conta}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                      <span>
                        <span className="text-muted">Visualizações </span>
                        <strong>{d.marketplace === "magalu" ? "—" : d.visitas.toLocaleString("pt-BR")}</strong>
                      </span>
                      <span>
                        <span className="text-muted">Vendas </span>
                        <strong>{d.vendidos}</strong>
                        {d.visitas && d.vendidos ? <span className="text-muted"> ({((d.vendidos / d.visitas) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span> : null}
                      </span>
                      <span>
                        <span className="text-muted">Taxas </span>
                        <strong className="text-red">{formatBRL(d.taxas)}</strong>
                        {d.vendido ? <span className="text-muted"> ({((d.taxas / d.vendido) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span> : null}
                      </span>
                      <span>
                        <span className="text-muted">Frete pago </span>
                        <strong className="text-red">{formatBRL(d.frete)}</strong>
                      </span>
                      {d.marketplace === "shopee" ? (
                        <span>
                          <span className="text-muted">Curtidas </span>
                          <strong>{d.curtidas}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHeader
              title="Histórico de anúncios"
              action={
                <Link href="/marketplaces/anuncios" className={buttonClass("outline", "sm")}>
                  Vincular anúncio existente
                </Link>
              }
            />
            {historico.length === 0 ? (
              <p className="p-5 text-sm text-muted">Este produto ainda não foi anunciado.</p>
            ) : (
              <div className="grid divide-y divide-border">
                {historico.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <MarcaIcone canal={a.marketplace} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{MARKETPLACE_INFO[a.marketplace].nome}</span>
                        <span className="text-muted">{a.conta.nome}</span>
                        <Badge tone={a.status === "publicado" ? "green" : "red"}>{a.status}</Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {formatDate(a.criadoEm)} · {formatBRL(a.preco)}
                        {a.idExterno ? ` · ${a.idExterno}` : ""}
                      </p>
                      {a.mensagem ? <p className="mt-1 break-words text-xs text-red">{a.mensagem}</p> : null}
                    </div>
                    {a.link ? (
                      <a href={a.link} target="_blank" rel="noreferrer" className="text-muted hover:text-gold" title="Abrir anúncio">
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
