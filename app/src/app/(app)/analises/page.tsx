import { AlertTriangle, ArrowDownRight, ArrowUpRight, Moon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CANAIS, MarcaIcone, type Canal } from "@/components/marca";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CANAIS_VENDA, type CanalVenda } from "@/db/schema";
import { analisarVendas, PERIODOS, type Periodo, type Totais } from "@/lib/analise-vendas";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL } from "@/lib/utils";
import { GraficoBarras } from "./grafico";

export const metadata: Metadata = { title: "Análise de vendas" };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Variacao({ atual, antes }: { atual: number; antes: number }) {
  const v = antes ? ((atual - antes) / Math.abs(antes)) * 100 : atual ? 100 : 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", v > 0 ? "text-green" : v < 0 ? "text-red" : "text-muted")}>
      {v > 0 ? <ArrowUpRight className="size-3.5" /> : v < 0 ? <ArrowDownRight className="size-3.5" /> : null}
      {v ? `${v > 0 ? "+" : ""}${v.toFixed(0)}%` : "0%"}
      <span className="font-normal text-muted">vs anterior</span>
    </span>
  );
}

const CLASSE = {
  A: { tom: "gold", dica: "Os que fazem 80% do faturamento: nunca deixe faltar." },
  B: { tom: "blue", dica: "Vendem, mas pouco: dá para crescer (anúncio, vídeo, preço)." },
  C: { tom: "neutral", dica: "Pouca venda: reavalie se vale manter." },
} as const;

export default async function AnalisesPage({ searchParams }: { searchParams: Promise<{ periodo?: string; canal?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "30d") as Periodo;
  const canal = CANAIS_VENDA.includes(sp.canal as CanalVenda) ? (sp.canal as CanalVenda) : undefined;
  const r = await analisarVendas(periodo, canal);
  const t = r.totais;
  const a = r.totaisAntes;
  const link = (p: Periodo, c?: string) => `/analises?${new URLSearchParams({ periodo: p, ...(c ? { canal: c } : {}) })}`;

  const kpis: { titulo: string; valor: string; atual: number; antes: number; destaque?: string }[] = [
    { titulo: "Faturamento", valor: formatBRL(t.faturamento), atual: t.faturamento, antes: a.faturamento },
    { titulo: "Pedidos", valor: String(t.pedidos), atual: t.pedidos, antes: a.pedidos },
    { titulo: "Ticket médio", valor: formatBRL(t.pedidos ? t.faturamento / t.pedidos : 0), atual: t.pedidos ? t.faturamento / t.pedidos : 0, antes: a.pedidos ? a.faturamento / a.pedidos : 0 },
    { titulo: "Unidades vendidas", valor: String(t.unidades), atual: t.unidades, antes: a.unidades },
    { titulo: "Taxas + frete", valor: formatBRL(t.taxas), atual: t.taxas, antes: a.taxas, destaque: t.faturamento ? `${pct(t.taxas / t.faturamento)} do faturamento` : "" },
    {
      titulo: "Lucro",
      valor: formatBRL(t.lucro),
      atual: t.lucro,
      antes: a.lucro,
      destaque: t.faturamento ? `margem ${pct(t.lucro / t.faturamento)}` : "",
    },
  ];
  const semCusto = r.ranking.filter((l) => l.semCusto).length;
  const maxCanal = Math.max(...r.canais.map((c) => c.faturamento), 1);
  const melhorDia = r.semana.reduce((m, d, i) => (d.faturamento > r.semana[m]!.faturamento ? i : m), 0);

  return (
    <>
      <PageHeader title="Análise de vendas" description="Quanto vendeu, quanto sobrou depois de taxas, frete e custo de produção, e quais produtos sustentam o negócio." />
      <div className="grid gap-6">
        {/* Filtros numa linha só, acima de tudo. */}
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex flex-wrap gap-1">
            {Object.entries(PERIODOS).map(([k, rot]) => (
              <Link key={k} href={link(k as Periodo, canal)} scroll={false} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", k === periodo ? "bg-gold text-[#0a1a33]" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
                {rot}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
            <Link href={link(periodo)} scroll={false} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", !canal ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2")}>
              Todos
            </Link>
            {CANAIS_VENDA.map((c) => (
              <Link
                key={c}
                href={link(periodo, c)}
                scroll={false}
                title={CANAIS[c as Canal].nome}
                className={cn("rounded-lg p-1", canal === c ? "bg-primary/20 ring-1 ring-primary" : "opacity-70 hover:opacity-100")}
              >
                <MarcaIcone canal={c as Canal} className="size-7" />
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.titulo} className={cn("grid content-start gap-1 p-4", k.titulo === "Lucro" && (t.lucro >= 0 ? "border-green/50" : "border-red/50"))}>
              <span className="text-xs font-semibold text-muted">{k.titulo}</span>
              <span className={cn("text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap", k.titulo === "Lucro" && (t.lucro >= 0 ? "text-green" : "text-red"), k.titulo === "Taxas + frete" && "text-red")}>
                {k.valor}
              </span>
              {k.destaque ? <span className="text-xs text-muted">{k.destaque}</span> : null}
              <Variacao atual={k.atual} antes={k.antes} />
            </Card>
          ))}
        </div>
        {semCusto ? (
          <p className="flex items-center gap-2 text-xs text-gold">
            <AlertTriangle className="size-4" /> {semCusto} produto(s) vendidos sem custo cadastrado: o lucro deles está maior do que o real. Cadastre o custo no produto.
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title={r.porMes ? "Faturamento por mês" : "Faturamento por dia"} description={`${r.iv.deIso.split("-").reverse().join("/")} a ${r.iv.ateIso.split("-").reverse().join("/")}`} />
            <div className="p-4 sm:p-5">
              <GraficoBarras
                marcarCada={r.porMes ? 1 : r.serie.length > 31 ? 10 : r.serie.length > 10 ? 3 : 1}
                barras={r.serie.map((s) => ({
                  rotulo: r.porMes ? MESES[Number(s.chave.slice(5, 7)) - 1]! : s.chave.slice(8, 10),
                  detalhe: r.porMes ? `${MESES[Number(s.chave.slice(5, 7)) - 1]}/${s.chave.slice(0, 4)} · ${s.pedidos} pedido(s)` : `${s.chave.split("-").reverse().join("/")} · ${s.pedidos} pedido(s)`,
                  valor: s.faturamento,
                  texto: formatBRL(s.faturamento),
                }))}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Dia da semana que mais vende" description={r.semana[melhorDia]!.faturamento ? `${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][melhorDia]} é o seu melhor dia.` : "Sem vendas no período."} />
            <div className="p-4 sm:p-5">
              <GraficoBarras altura={140} barras={r.semana.map((d, i) => ({ rotulo: DIAS[i]!, detalhe: `${DIAS[i]} · ${d.pedidos} pedido(s)`, valor: d.faturamento, texto: formatBRL(d.faturamento) }))} />
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Por canal" description="Faturamento, o que cada canal cobrou (taxas + frete) e o que sobrou depois do custo de produção." />
          {r.canais.length ? (
            <div className="grid gap-3 p-4 sm:p-5">
              {r.canais.map((c) => (
                <div key={c.canal} className="grid gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex min-w-40 items-center gap-2 font-semibold">
                      <MarcaIcone canal={c.canal as Canal} className="size-6" /> {CANAIS[c.canal as Canal].nome}
                    </span>
                    <span>
                      <strong>{formatBRL(c.faturamento)}</strong> <span className="text-muted">· {c.pedidos} pedido(s)</span>
                    </span>
                    <span className="text-red">
                      taxas {formatBRL(c.taxas)} <span className="text-muted">({c.faturamento ? pct(c.taxas / c.faturamento) : "0%"})</span>
                    </span>
                    <span className={cn("font-semibold", c.lucro >= 0 ? "text-green" : "text-red")}>
                      lucro {formatBRL(c.lucro)} <span className="font-normal text-muted">({c.faturamento ? pct(c.lucro / c.faturamento) : "0%"})</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(c.faturamento / maxCanal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">Nenhuma venda no período.</p>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Produtos: curva ABC" description="Ordenados pelo faturamento. A = os que fazem 80% das vendas, B = até 95%, C = o resto." />
            {r.ranking.length ? (
              <div className="grid divide-y divide-border">
                {r.ranking.slice(0, 30).map((l) => {
                  const margem = l.faturamento ? l.lucro / l.faturamento : 0;
                  const conteudo = (
                    <>
                      {l.imagem ? <img src={l.imagem} alt="" className="size-11 shrink-0 rounded-lg bg-surface-2 object-contain" /> : <span className="size-11 shrink-0 rounded-lg bg-surface-2" />}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2">
                          <Badge tone={CLASSE[l.classe].tom} title={CLASSE[l.classe].dica}>
                            {l.classe}
                          </Badge>
                          <span className="truncate text-sm font-semibold">{l.nome}</span>
                        </p>
                        <p className="text-xs text-muted">
                          {l.unidades} un. · {formatBRL(l.faturamento)}
                          {l.semCusto ? <span className="text-gold"> · sem custo cadastrado</span> : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-extrabold", l.lucro >= 0 ? "text-green" : "text-red")}>{formatBRL(l.lucro)}</p>
                        <p className={cn("text-xs font-semibold", margem >= 0.15 ? "text-green" : margem >= 0 ? "text-gold" : "text-red")}>margem {pct(margem)}</p>
                      </div>
                    </>
                  );
                  return l.produtoId ? (
                    <Link key={l.chave} href={`/produtos/${l.produtoId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                      {conteudo}
                    </Link>
                  ) : (
                    <div key={l.chave} className="flex items-center gap-3 px-4 py-2.5 sm:px-5" title="Item sem produto vinculado (SKU não encontrado no cadastro)">
                      {conteudo}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<AlertTriangle />} title="Nenhuma venda no período" description="Escolha outro período ou canal." />
            )}
          </Card>
          <Card>
            <CardHeader title="Anunciados sem venda" description="Estão no ar e não venderam nada no período: revise preço, fotos e título, ou tire do catálogo." />
            {r.parados.length ? (
              <div className="grid divide-y divide-border">
                {r.parados.slice(0, 20).map((p) => (
                  <Link key={p.id} href={`/produtos/${p.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2/60 sm:px-5">
                    {p.imagem ? <img src={p.imagem} alt="" className="size-9 shrink-0 rounded-lg bg-surface-2 object-contain" /> : <span className="size-9 shrink-0 rounded-lg bg-surface-2" />}
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <Moon className="size-4 shrink-0 text-muted" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-green">Todos os produtos anunciados venderam no período.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
