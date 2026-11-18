import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { MarcaIcone } from "@/components/marca";
import { ArrowLeft, Copy, ExternalLink, RefreshCw, Trash2, Unlink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { anuncios, arquivosProduto, contasMarketplace, NOMES_FONTE, produtos, type OrigemModelo3d } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { geminiConfigurado } from "@/lib/gemini";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { listaFilamentos } from "@/lib/filamentos";
import { getParametrosImpressao, getParametrosPreco, getSettings } from "@/lib/settings";
import { formatBRL, formatDate } from "@/lib/utils";
import { confirmarLicencaModelo, conferirAnunciosProduto, desvincularAnuncio, duplicarProduto, excluirProduto } from "../actions";
import { Anunciar } from "../anunciar";
import { ArquivosImpressao } from "../arquivos-impressao";
import { ProdutoForm } from "../produto-form";
import { BaixarArquivosOrigem } from "../baixar-origem";
import { listaCategorias } from "@/lib/categorias";
import { ajustesPorCategoria } from "@/lib/taxas";

export default async function ProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; copia?: string; ok?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { salvo, copia, ok } = await searchParams;
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
        {ok ? <Alert tone="green">{ok}</Alert> : null}
        {produto.modelo3d ? <OrigemModelo produtoId={id} o={produto.modelo3d} semArquivos={!arquivos.length} /> : null}
        {copia ? (
          <Alert tone="green">
            Cópia criada com SKU {produto.sku}, estoque inicial padrão e sem anúncios. Ajuste o nome, o SKU e os preços e clique em Salvar alterações.
          </Alert>
        ) : null}
        {/* key: depois de salvar, o formulário recomeça com as mídias já gravadas (sem repetir os arquivos novos). */}
        <ProdutoForm
          categorias={await listaCategorias()} ajustes={await ajustesPorCategoria()}
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
            faltaMedidas={[!(produto.pesoG > 0) && "peso com embalagem", !(produto.alturaCm > 0) && "altura", !(produto.larguraCm > 0) && "largura", !(produto.comprimentoCm > 0) && "comprimento"].filter((x): x is string => Boolean(x))}
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
          <Card>
            <CardHeader
              title="Histórico de anúncios"
              action={
                <div className="flex flex-wrap gap-2">
                  <form action={conferirAnunciosProduto.bind(null, id)}>
                    <SubmitButton variant="outline" size="sm" pendingText="Conferindo...">
                      <RefreshCw /> Conferir nos marketplaces
                    </SubmitButton>
                  </form>
                  <Link href="/marketplaces/anuncios" className={buttonClass("outline", "sm")}>
                    Vincular anúncio existente
                  </Link>
                </div>
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
                        <Badge tone={a.status === "publicado" ? "green" : a.status === "pausado" ? "gold" : a.status === "encerrado" ? "neutral" : a.status === "processando" ? "blue" : "red"}>
                          {a.status === "encerrado" ? "não existe mais no marketplace" : a.status === "processando" ? "processando (o ERP termina sozinho)" : a.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {formatDate(a.criadoEm)} · {formatBRL(a.preco)}
                        {a.idExterno ? ` · ${a.idExterno}` : ""}
                      </p>
                      {a.mensagem ? <p className="mt-1 break-words text-xs text-red">{a.mensagem}</p> : null}
                    </div>
                    {a.link && a.status !== "encerrado" ? (
                      <a href={a.link} target="_blank" rel="noreferrer" className="text-muted hover:text-gold" title="Abrir anúncio">
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                    {/* Tira só o vínculo no ERP; o anúncio no marketplace não é alterado. */}
                    <form action={desvincularAnuncio.bind(null, a.id, id)}>
                      <button className="flex items-center gap-1 text-xs text-muted hover:text-red" title="Desvincular este anúncio do produto (não mexe no marketplace)">
                        <Unlink className="size-4" /> <span className="hidden sm:inline">Desvincular</span>
                      </button>
                    </form>
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

/** De onde veio o modelo 3D, a licença e (se não comercial) a confirmação da licença comercial para poder anunciar. */
function OrigemModelo({ produtoId, o, semArquivos }: { produtoId: string; o: OrigemModelo3d; semArquivos: boolean }) {
  const bloqueado = o.comercial === false && !o.licencaComercialPropria;
  return (
    <Alert tone={bloqueado ? "red" : o.comercial === true || o.licencaComercialPropria ? "green" : "gold"}>
      <div className="grid gap-1.5">
        <p className="font-semibold">
          Modelo 3D de origem: {NOMES_FONTE[o.fonte]}
          {o.autor ? ` · autor ${o.autor}` : ""}
          {o.link ? (
            <a href={o.link} target="_blank" rel="noreferrer" className="ml-2 underline">
              abrir
            </a>
          ) : null}
        </p>
        <p className="text-sm">
          Licença: {o.licenca || "não identificada"}.{" "}
          {o.comercial === true
            ? "Pode vender (dê crédito ao autor quando a licença pedir)."
            : o.comercial === false
              ? o.licencaComercialPropria
                ? "Você confirmou que tem a licença comercial: pode anunciar."
                : "Não comercial: o anúncio fica bloqueado até você confirmar que comprou a licença comercial do autor."
              : "Confira no site se o autor permite vender as impressões."}
        </p>
        {semArquivos && o.link ? <BaixarArquivosOrigem produtoId={produtoId} /> : null}
        {o.comercial === false ? (
          <form action={confirmarLicencaModelo.bind(null, produtoId, !o.licencaComercialPropria)}>
            <SubmitButton size="sm" variant={o.licencaComercialPropria ? "outline" : "gold"} pendingText="Salvando...">
              {o.licencaComercialPropria ? "Desfazer: ainda não tenho a licença" : "Confirmo que tenho a licença comercial deste modelo"}
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Alert>
  );
}
