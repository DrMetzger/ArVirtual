import { Bot, Eye, EyeOff, Loader2, Plus, Radar, Sparkles, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { painelSentinela } from "@/lib/sentinela";
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

export default async function SentinelaPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [p, trabalho] = await Promise.all([painelSentinela(), trabalhoEmAndamento()]);
  const ativos = p.termos.filter((t) => t.ativo);
  const sugeridos = p.termos.filter((t) => !t.ativo);
  // Demanda x concorrência por nicho: muita venda (ou bom ranking) com poucos vendedores = oportunidade.
  const nichos = Object.values(
    p.nichos.reduce<Record<string, { termo: string; shopee?: (typeof p.nichos)[number]; ml?: (typeof p.nichos)[number] }>>((acc, n) => {
      const x = (acc[n.termo] ??= { termo: n.termo });
      if (n.fonte === "shopee") x.shopee = n;
      else x.ml = n;
      return acc;
    }, {}),
  )
    .map((n) => {
      const demanda = (n.shopee?.vendas ?? 0) + (n.shopee?.velocidade ?? 0) * 30;
      const concorrencia = Math.max(1, n.shopee?.lojas ?? 0) * Math.max(1, n.ml?.vendedores ?? 1);
      return { ...n, demanda, concorrencia, score: demanda / concorrencia };
    })
    .sort((a, b) => b.score - a.score);
  const semDados = !p.totais?.itens;

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} />
      <PageHeader
        title="Sentinela de mercado"
        description="Vigia o mercado de peças impressas em 3D na Shopee e no Mercado Livre: o que vende agora, quem disputa, quanto custa fazer na sua impressora e quanto sobra no Magalu, ML e Shopee. (O Magalu não libera dados de concorrentes por API; a margem dele vem das suas taxas.)"
        actions={
          <>
            <form action={coletarAgora}>
              <SubmitButton variant="gold" pendingText="Soltando as sentinelas..." disabled={Boolean(trabalho)}>
                <Radar /> Coletar agora
              </SubmitButton>
            </form>
            <form action={relatorioAgora}>
              <SubmitButton variant="primary" pendingText="Chamando a IA..." disabled={Boolean(trabalho) || semDados}>
                <Sparkles /> Plano da IA
              </SubmitButton>
            </form>
            <Link href="/sentinela/concorrencia" className={buttonClass("outline")}>
              <Users /> Concorrência por produto
            </Link>
          </>
        }
      />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        {trabalho ? (
          <Alert tone="gold">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> {trabalho.tipo === "coleta" ? "Coletando e analisando" : "Gerando o plano da IA"} em segundo plano. Quando
              terminar, aparece o botão “Ver resultado” no canto da tela.
            </span>
          </Alert>
        ) : null}
        <p className="text-xs text-muted">
          {p.totais?.itens ?? 0} produtos vigiados · <b className="text-foreground">{p.totais?.aprovados ?? 0} peças 3D que cabem na sua impressora</b>
          {p.totais?.naFila ? ` · ${p.totais.naFila} aguardando a IA` : ""} · {p.totais?.leituras ?? 0} leituras · última coleta {p.ultimaColeta ? formatDate(p.ultimaColeta) : "nunca"} · coleta
          automática a cada 4 h, IA analisa o que sobe e o plano sai 1 vez por dia. A velocidade (vendas/dia) aparece a partir da segunda leitura.
        </p>

        {semDados ? (
          <EmptyState icon={<Radar />} title="As sentinelas ainda não saíram" description="Clique em Coletar agora: em alguns minutos aparecem os produtos, nichos e oportunidades." />
        ) : null}

        {p.relatorio ? (
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Bot className="size-5 text-gold" /> Plano da IA
                </span>
              }
              description={`Gerado em ${formatDate(p.relatorio.criadoEm)} com os dados do sentinela e pesquisa na internet.`}
            />
            <div className="prose-sm max-w-none p-5 text-sm leading-relaxed">
              <Markdown texto={p.relatorio.texto} />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="🎯 Oportunidades para imprimir"
            description="Só peças impressas em 3D que a IA confirmou que saem da A1 mini, com margem de 30% ou mais no Magalu, no preço que o concorrente cobra (taxas de Configurações). ML e Shopee ao lado para comparar."
          />
          <Grade itens={p.oportunidades as ItemSentinela[]} vazio="Ainda sem oportunidades analisadas: rode uma coleta (a IA analisa em seguida)." />
        </Card>

        <Card>
          <CardHeader title="🔥 Peças 3D vendendo agora na Shopee" description="Buscas dos seus nichos com “3d”. Ordenado pela velocidade (vendas por dia entre as leituras) e pelo total vendido." />
          <Grade itens={p.subindoShopee as ItemSentinela[]} vazio="Nenhuma peça 3D aprovada ainda na Shopee: a IA analisa a fila a cada coleta." />
        </Card>

        <Card>
          <CardHeader title="🏆 Peças 3D no ranking do Mercado Livre" description="Mais vendidos das categorias dos seus nichos que a IA aprovou para a sua impressora, com quantos vendedores disputam e o menor preço." />
          <Grade itens={p.subindoML as ItemSentinela[]} vazio="Nenhuma peça 3D aprovada ainda no Mercado Livre: a IA analisa a fila a cada coleta." />
        </Card>

        {p.novos.length ? (
          <Card>
            <CardHeader title="🆕 Apareceram nas últimas 48 h" description="Produtos que as sentinelas viram pela primeira vez: novidade entrando no mercado." />
            <Grade itens={p.novos as ItemSentinela[]} vazio="" />
          </Card>
        ) : null}

        {nichos.length ? (
          <Card>
            <CardHeader title="Nichos: demanda x concorrência" description="Mais acima = mais venda para menos lojas/vendedores. É onde entrar primeiro." />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Nicho</th>
                    <th className="text-right">Vendas Shopee</th>
                    <th className="text-right">Lojas Shopee</th>
                    <th className="text-right">Preço mediano</th>
                    <th className="text-right">Vendedores/produto ML</th>
                    <th>Leitura</th>
                  </tr>
                </thead>
                <tbody>
                  {nichos.map((n, idx) => (
                    <tr key={n.termo}>
                      <td className="font-semibold">{n.termo}</td>
                      <td className="text-right">{(n.shopee?.vendas ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="text-right">{n.shopee?.lojas ?? "—"}</td>
                      <td className="text-right">{formatBRL(n.shopee?.preco_mediano || n.ml?.preco_mediano || 0)}</td>
                      <td className="text-right">{n.ml ? n.ml.vendedores.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                      <td>
                        {idx < 5 ? <Badge tone="green">Entrar já</Badge> : idx < nichos.length / 2 ? <Badge tone="gold">Bom</Badge> : <Badge>Disputado</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        <Card id="termos">
          <CardHeader title="O que as sentinelas vigiam" description={`${ativos.length} termo(s) ativos. A IA e as buscas em alta do ML sugerem novos sozinhas.`} />
          <div className="grid gap-4 p-5">
            <form action={adicionarTermo} className="flex flex-wrap gap-2">
              <Input name="termo" placeholder="Ex.: suporte de controle, vaso geométrico (separe vários por vírgula)" className="min-w-0 flex-1" />
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
              <>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Sugestões (buscas em alta no ML e termos pausados)</p>
                <div className="flex flex-wrap gap-2">
                  {sugeridos.slice(0, 60).map((t) => (
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
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
