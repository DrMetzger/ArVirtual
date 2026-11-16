import { asc } from "drizzle-orm";
import { FileText, Percent } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarcaIcone } from "@/components/marca";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { categorias, contratosTaxas, type TaxaCategoria } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  getParametrosPreco,
  getSettingsForDisplay,
  pedidosShopee90d,
} from "@/lib/settings";
import { PLATAFORMAS_TAXA, type MarketplaceTaxa } from "@/lib/taxas";
import { formatBRL, formatDate } from "@/lib/utils";
import { IntegracaoForm } from "../../configuracoes/forms";
import { EnviarContrato, EscolherCategoria, RelerML } from "./client";

export const metadata: Metadata = { title: "Taxas e contratos" };

const NOMES: Record<MarketplaceTaxa, string> = {
  magalu: "Magalu",
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};
const GRUPO: Record<MarketplaceTaxa, string> = {
  magalu: "Precificação: Magalu",
  mercadolivre: "Precificação: Mercado Livre",
  shopee: "Precificação: Shopee",
  tiktok: "Precificação: TikTok Shop",
};
const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const taxaTexto = (t: { comissao: number; fixa?: number }) =>
  `${pct(t.comissao)}${t.fixa ? ` + ${formatBRL(t.fixa)}` : ""}`;

export default async function TaxasPage() {
  await requireUser();
  const [contratos, cats, params, ajustes, pedidos90] = await Promise.all([
    db.select().from(contratosTaxas),
    db
      .select()
      .from(categorias)
      .orderBy(asc(categorias.ordem), asc(categorias.nome)),
    getParametrosPreco(),
    getSettingsForDisplay(),
    pedidosShopee90d(),
  ]);
  const contrato = (m: MarketplaceTaxa) =>
    contratos.find((c) => c.marketplace === m);

  return (
    <>
      <PageHeader
        title="Taxas e contratos"
        description="Comissão e taxa fixa de cada plataforma, aplicadas sozinhas no preço sugerido e no lucro de cada produto. Envie o contrato da plataforma e a IA destrincha as taxas."
      />
      <div className="grid gap-6">
        {PLATAFORMAS_TAXA.map((m) => {
          const c = contrato(m);
          const ex = c?.extraido;
          const t = params.canais[m];
          const itens = ajustes.filter((s) => s.group === GRUPO[m]);
          return (
            <Card key={m}>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <MarcaIcone canal={m} className="size-6" /> {NOMES[m]}
                  </span>
                }
                description="Tabela que vale agora (por preço de venda do item):"
              />
              <div className="flex flex-wrap gap-2 px-5">
                {t.faixas.map((f, i) => (
                  <Badge key={i} tone="blue">
                    {f.ate === Infinity
                      ? i
                        ? `acima de ${formatBRL(t.faixas[i - 1]!.ate)}`
                        : "qualquer preço"
                      : `até ${formatBRL(f.ate)}`}
                    : {taxaTexto(f)}
                  </Badge>
                ))}
                {t.campanha ? <Badge>campanha {pct(t.campanha)}</Badge> : null}
                {t.adicional ? (
                  <Badge tone="gold">
                    + {formatBRL(t.adicional)} por item (CPF acima de 450
                    pedidos)
                  </Badge>
                ) : null}
              </div>
              {m === "shopee" ? (
                <p className="px-5 pt-3 text-xs text-muted">
                  {pedidos90} pedido(s) da Shopee nos últimos 90 dias.{" "}
                  {t.adicional
                    ? "Passou de 450: o adicional do CPF entrou no cálculo."
                    : "Abaixo de 450: sem o adicional de R$ 3 do vendedor CPF (o sistema confere sozinho)."}{" "}
                  A comissão é igual para todas as categorias.
                </p>
              ) : m === "mercadolivre" ? (
                <p className="px-5 pt-3 text-xs text-muted">
                  A comissão muda com a categoria (10% a 14% no Clássico, 15% a
                  19% no Premium): o sistema pergunta à API do Mercado Livre a
                  de cada categoria do seu catálogo (quadro abaixo).
                </p>
              ) : null}
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="grid content-start gap-3 rounded-xl border border-border p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-bold">
                    <FileText className="size-4 text-muted" /> Contrato
                  </p>
                  {c ? (
                    <div className="grid gap-1 text-xs text-muted">
                      <p className="font-semibold text-foreground">
                        {c.nomeArquivo || "Contrato"}
                      </p>
                      <p>Lido em {formatDate(c.atualizadoEm)}</p>
                      {c.erro ? <p className="text-red">{c.erro}</p> : null}
                      {ex ? (
                        <p>
                          Padrão {taxaTexto(ex.padrao)}
                          {ex.padrao.fixa && ex.padrao.fixaAPartirDe
                            ? ` (taxa fixa a partir de ${formatBRL(ex.padrao.fixaAPartirDe)})`
                            : ""}
                          {ex.categorias.length
                            ? ` · ${ex.categorias.length} categorias`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Nenhum contrato enviado. Sem ele vale a tabela acima.
                    </p>
                  )}
                  {ex?.observacoes.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                      {ex.observacoes.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  ) : null}
                  {ex?.categorias.length ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold text-gold">
                        Ver comissão de cada categoria do contrato
                      </summary>
                      <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {ex.categorias.map((k) => (
                          <li
                            key={k.nome}
                            className="flex justify-between gap-2 border-b border-border/60 py-1"
                          >
                            <span className="min-w-0 truncate">{k.nome}</span>
                            <span className="shrink-0 font-semibold">
                              {taxaTexto({
                                comissao: k.comissao,
                                fixa: k.fixa ?? ex.padrao.fixa,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <EnviarContrato marketplace={m} temContrato={Boolean(c)} />
                </div>
                <details className="self-start rounded-xl border border-border p-4">
                  <summary className="cursor-pointer text-sm font-bold">
                    Ajustar à mão (campanha, frete, faixas)
                  </summary>
                  <div className="mt-3">
                    <IntegracaoForm
                      grupo={GRUPO[m]}
                      itens={itens}
                      ajuda="Faixas vazias = tabela oficial / contrato. Ao enviar um contrato novo, as faixas são trocadas pelas dele."
                    />
                  </div>
                </details>
              </div>
            </Card>
          );
        })}

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Percent className="size-5 text-gold" /> Taxa por categoria do
                catálogo
              </span>
            }
            description="Cada produto paga a taxa da sua categoria. Tudo é preenchido sozinho (contrato lido pela IA e API do Mercado Livre); escolha à mão só se quiser corrigir."
            action={<RelerML />}
          />
          {cats.length ? (
            <div className="divide-y divide-border">
              {cats.map((cat) => {
                const mag = cat.taxas.magalu;
                const ml = cat.taxas.mercadolivre;
                const exMag = contrato("magalu")?.extraido;
                return (
                  <div
                    key={cat.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,14rem)_1fr_1fr_minmax(0,10rem)]"
                  >
                    <Link
                      href={`/produtos?cat=${cat.id}`}
                      className="font-semibold hover:text-gold"
                    >
                      {cat.nome}
                    </Link>
                    <Celula
                      canal="magalu"
                      taxa={mag}
                      vazio={
                        exMag
                          ? "Ligando ao contrato..."
                          : "Envie o contrato do Magalu"
                      }
                      fixaPadrao={exMag?.padrao.fixa}
                    >
                      {exMag?.categorias.length ? (
                        <EscolherCategoria
                          categoriaId={cat.id}
                          marketplace="magalu"
                          atual={mag?.categoria ?? ""}
                          manual={mag?.origem === "manual"}
                          opcoes={exMag.categorias.map((k) => ({
                            nome: k.nome,
                            rotulo: `${k.nome} (${taxaTexto({ comissao: k.comissao, fixa: k.fixa ?? exMag.padrao.fixa })})`,
                          }))}
                        />
                      ) : null}
                    </Celula>
                    <Celula
                      canal="mercadolivre"
                      taxa={ml}
                      vazio="Consultando a API do Mercado Livre..."
                      extra={
                        ml?.comissaoPremium
                          ? `Premium ${pct(ml.comissaoPremium)}`
                          : undefined
                      }
                    />
                    <div className="flex items-start gap-2 text-xs text-muted">
                      <MarcaIcone canal="shopee" className="size-5 shrink-0" />{" "}
                      tabela por preço
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">
              Cadastre as categorias em{" "}
              <Link href="/categorias" className="text-gold underline">
                Cadastros › Categorias
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Celula({
  canal,
  taxa,
  vazio,
  extra,
  fixaPadrao,
  children,
}: {
  canal: MarketplaceTaxa;
  taxa?: TaxaCategoria;
  vazio: string;
  extra?: string;
  fixaPadrao?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <MarcaIcone canal={canal} className="size-5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1 text-xs">
        {taxa ? (
          <>
            <p>
              <span className="text-sm font-bold">
                {taxaTexto({
                  comissao: taxa.comissao,
                  fixa: taxa.fixa ?? fixaPadrao,
                })}
              </span>
              {extra ? <span className="text-muted"> · {extra}</span> : null}
            </p>
            <p className="truncate text-muted" title={taxa.categoria}>
              {taxa.categoria} ·{" "}
              {taxa.origem === "manual"
                ? "escolhida à mão"
                : taxa.origem === "api"
                  ? "API do ML"
                  : "contrato (IA)"}
            </p>
          </>
        ) : (
          <p className="text-muted italic">{vazio}</p>
        )}
        {children}
      </div>
    </div>
  );
}
