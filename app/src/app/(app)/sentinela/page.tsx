import { Bot, Clock, Eye, EyeOff, Hourglass, Plus, Printer, Radar, Sparkles, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Abas } from "@/components/abas";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { campeoesMagalu, painelSentinela } from "@/lib/sentinela";
import { formatBRL, formatDate } from "@/lib/utils";
import { Markdown } from "../assistente/markdown";
import { adicionarTermo, alternarTermo, coletarAgora, excluirTermo, relatorioAgora, trabalhoEmAndamento } from "./actions";
import { AtualizarSozinho } from "./atualizar";
import { ItemCard, type ItemSentinela } from "./item-card";

export const metadata: Metadata = { title: "Sentinela de mercado" };

const ORIGEM = { padrao: "padrão", ia: "IA", tendencia: "em alta no ML", usuario: "você" } as const;

function Grade({ itens, vazio }: { itens: ItemSentinela[]; vazio: string }) {
  if (!itens.length) return <p className="p-5 text-sm text-muted">{vazio}</p>;
  return <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{itens.map((i) => <ItemCard key={i.id} i={i} semComissao />)}</div>;
}

const Selo = ({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold">
    {icone}
    {children}
  </span>
);

export default async function SentinelaPage({ searchParams }: { searchParams: Promise<{ erro?: string; aba?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [p, trabalho, magalu] = await Promise.all([painelSentinela(), trabalhoEmAndamento(), campeoesMagalu()]);
  const ativos = p.termos.filter((t) => t.ativo);
  const sugeridos = p.termos.filter((t) => !t.ativo);
  const nichos = Object.values(
    p.nichos.reduce<Record<string, { termo: string; shopee?: (typeof p.nichos)[number]; ml?: (typeof p.nichos)[number] }>>((acc, n) => {
      const x = (acc[n.termo] ??= { termo: n.termo });
      if (n.fonte === "shopee") x.shopee = n;
      else x.ml = n;
      return acc;
    }, {}),
  )
    .map((n) => ({ ...n, score: ((n.shopee?.vendas ?? 0) + (n.shopee?.velocidade ?? 0) * 30) / (Math.max(1, n.shopee?.lojas ?? 0) * Math.max(1, n.ml?.vendedores ?? 1)) }))
    .sort((a, b) => b.score - a.score);
  const semDados = !p.totais?.itens;

  const abas = [
    {
      id: "oportunidades",
      rotulo: <>🎯 Oportunidades ({p.oportunidades.length})</>,
      conteudo: (
        <Card>
          <CardHeader title="Oportunidades para imprimir" description="Peças 3D que cabem na sua impressora e deixam 30%+ de margem no Magalu." />
          <Grade itens={p.oportunidades as ItemSentinela[]} vazio="Ainda sem oportunidades: a IA está analisando a fila." />
        </Card>
      ),
    },
    {
      id: "magalu",
      rotulo: (
        <>
          <MarcaIcone canal="magalu" className="size-5" /> Seu Magalu ({magalu.length})
        </>
      ),
      conteudo: (
        <Card>
          <CardHeader title="Seus campeões no Magalu" description="Seus pedidos dos últimos 60 dias. Clique para ver quem mais vende o mesmo." />
          {magalu.length ? (
            <div className="divide-y divide-border">
              {magalu.map((m, i) => (
                <div key={`${m.sku}-${i}`} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="w-5 shrink-0 pt-1 text-center font-bold text-muted">{i + 1}</span>
                  <FotoAmpliavel src={m.imagem ?? ""} alt={m.titulo} className="size-16" />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="line-clamp-2 font-semibold">{m.titulo}</p>
                    <p className="text-xs text-muted">
                      <b className="text-foreground">{m.quantidade} un.</b> · {formatBRL(m.faturamento)} · {m.pedidos} pedido(s){m.sku ? ` · ${m.sku}` : ""}
                    </p>
                    <Link
                      href={`/sentinela/concorrencia?q=${encodeURIComponent(m.titulo.split(/\s+/).slice(0, 5).join(" "))}`}
                      className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-gold hover:underline"
                    >
                      <Users className="size-3.5" /> Ver quem vende
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Nenhum pedido do Magalu nos últimos 60 dias.</p>
          )}
        </Card>
      ),
    },
    {
      id: "shopee",
      rotulo: (
        <>
          <MarcaIcone canal="shopee" className="size-5" /> Shopee ({p.subindoShopee.length})
        </>
      ),
      conteudo: (
        <Card>
          <CardHeader title="Peças 3D vendendo na Shopee" description="Ordem: vendas por dia, depois total vendido." />
          <Grade itens={p.subindoShopee as ItemSentinela[]} vazio="Nenhuma peça aprovada ainda: a IA está analisando a fila." />
        </Card>
      ),
    },
    {
      id: "ml",
      rotulo: (
        <>
          <MarcaIcone canal="mercadolivre" className="size-5" /> Mercado Livre ({p.subindoML.length})
        </>
      ),
      conteudo: (
        <Card>
          <CardHeader title="Peças 3D no ranking do Mercado Livre" description="Mais vendidos da categoria, vendedores e menor preço." />
          <Grade itens={p.subindoML as ItemSentinela[]} vazio="Nenhuma peça aprovada ainda: a IA está analisando a fila." />
        </Card>
      ),
    },
    {
      id: "nichos",
      rotulo: <>📊 Nichos ({nichos.length})</>,
      conteudo: (
        <Card>
          <CardHeader title="Demanda x concorrência" description="Mais acima = mais venda para menos vendedores." />
          {nichos.length ? (
            <div className="divide-y divide-border">
              {nichos.map((n, idx) => (
                <div key={n.termo} className="grid gap-1 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold break-words">{n.termo}</span>
                    {idx < 5 ? <Badge tone="green">Entrar já</Badge> : idx < nichos.length / 2 ? <Badge tone="gold">Bom</Badge> : <Badge>Disputado</Badge>}
                  </div>
                  <p className="text-xs text-muted">
                    {(n.shopee?.vendas ?? 0).toLocaleString("pt-BR")} vendas · {n.shopee?.lojas ?? 0} loja(s) · preço do meio{" "}
                    {formatBRL(n.shopee?.preco_mediano || n.ml?.preco_mediano || 0)}
                    {n.ml ? ` · ${n.ml.vendedores.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} vendedores/produto no ML` : ""}
                  </p>
                  <a href={`/sentinela/concorrencia?q=${encodeURIComponent(n.termo)}`} className="w-fit text-xs font-semibold text-gold hover:underline">
                    Ver quem vende
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Sem nichos com peças aprovadas ainda.</p>
          )}
        </Card>
      ),
    },
    {
      id: "plano",
      rotulo: <>🤖 Plano da IA</>,
      conteudo: (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Bot className="size-5 text-gold" /> Plano da IA
              </span>
            }
            description={p.relatorio ? `Gerado em ${formatDate(p.relatorio.criadoEm)}` : "Ainda não gerado"}
          />
          {p.relatorio ? (
            <div className="max-w-3xl p-5 text-sm leading-relaxed">
              <Markdown texto={p.relatorio.texto} />
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Clique em Plano da IA lá em cima.</p>
          )}
        </Card>
      ),
    },
    {
      id: "vigiar",
      rotulo: <>👁 Vigiar ({ativos.length})</>,
      conteudo: (
        <Card>
          <CardHeader title="O que as sentinelas vigiam" description="A IA e as buscas em alta do ML sugerem novos termos sozinhas." />
          <div className="grid gap-4 p-5">
            <form action={adicionarTermo} className="flex flex-wrap gap-2">
              <Input name="termo" placeholder="Ex.: suporte de controle, vaso geométrico" className="min-w-0 flex-1" />
              <SubmitButton pendingText="Adicionando...">
                <Plus /> Vigiar
              </SubmitButton>
            </form>
            <div className="flex flex-wrap gap-2">
              {ativos.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pr-1 pl-3 text-sm">
                  {t.termo}
                  <span className="text-[10px] text-muted">({ORIGEM[t.origem]})</span>
                  <form action={alternarTermo.bind(null, t.id, false)}>
                    <button type="submit" className="rounded-full p-1 text-muted hover:text-gold" title="Parar de vigiar">
                      <EyeOff className="size-3.5" />
                    </button>
                  </form>
                </span>
              ))}
            </div>
            {sugeridos.length ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">Sugestões ({sugeridos.length})</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sugeridos.slice(0, 80).map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border py-1 pr-1 pl-3 text-sm text-muted" title={t.motivo}>
                      {t.termo}
                      <form action={alternarTermo.bind(null, t.id, true)}>
                        <button type="submit" className="rounded-full p-1 hover:text-green" title="Vigiar">
                          <Eye className="size-3.5" />
                        </button>
                      </form>
                      <form action={excluirTermo.bind(null, t.id)}>
                        <button type="submit" className="rounded-full p-1 hover:text-red" title="Descartar">
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </Card>
      ),
    },
  ];

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} />
      <PageHeader
        title="Sentinela de mercado"
        description="Peças 3D que vendem, quem disputa e quanto sobra para você."
        actions={
          <>
            <form action={coletarAgora}>
              <SubmitButton variant="gold" pendingText="Soltando..." disabled={Boolean(trabalho)}>
                <Radar /> Coletar agora
              </SubmitButton>
            </form>
            <form action={relatorioAgora}>
              <SubmitButton variant="outline" pendingText="Chamando a IA..." disabled={Boolean(trabalho) || semDados}>
                <Sparkles /> Plano da IA
              </SubmitButton>
            </form>
            <Link href="/sentinela/concorrencia" className={buttonClass("outline")}>
              <Users /> Concorrência
            </Link>
          </>
        }
      />
      <div className="grid gap-5">
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Selo icone={<Printer className="size-3.5 text-green" />}>{p.totais?.aprovados ?? 0} peças 3D aprovadas</Selo>
          {p.totais?.naFila ? <Selo icone={<Hourglass className="size-3.5 text-gold" />}>{p.totais.naFila} na fila da IA</Selo> : null}
          <Selo icone={<Clock className="size-3.5 text-muted" />}>coleta {p.ultimaColeta ? formatDate(p.ultimaColeta) : "nunca"}</Selo>
        </div>
        {semDados ? (
          <EmptyState icon={<Radar />} title="As sentinelas ainda não saíram" description="Clique em Coletar agora." />
        ) : (
          <Abas abas={abas} inicial={sp.aba && abas.some((a) => a.id === sp.aba) ? sp.aba : undefined} />
        )}
      </div>
    </>
  );
}
