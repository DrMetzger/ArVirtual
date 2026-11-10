import { desc, gte } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Eye, EyeOff, Filter, Flame, Gem, Link2, Plus, Radar, Star, Trash2, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos, garimpoItens } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { afiliadosEstimados, EM_ALTA, termosGarimpo } from "@/lib/garimpo";
import { formatBRL } from "@/lib/utils";
import { AtualizarSozinho } from "../../sentinela/atualizar";
import { adicionarTermoGarimpo, alternarTermoGarimpo, divulgarProduto, excluirTermoGarimpo, garimparAgora, garimpoEmAndamento, linkRapido } from "./actions";

export const metadata: Metadata = { title: "Garimpo de afiliados" };

const ORDENS = {
  garimpo: "Garimpo (melhor no geral)",
  afiliados: "Menos afiliados",
  nova: "Oferta mais nova",
  ganho: "Maior ganho por venda",
  comissao: "Maior comissão (%)",
  velocidade: "Vendendo mais rápido",
  vendas: "Mais vendidos",
} as const;
type Ordem = keyof typeof ORDENS;
type Params = Partial<Record<"ok" | "erro" | "ordem" | "q" | "termo" | "min" | "ganho" | "precoMin" | "precoMax" | "vendas" | "nota" | "nova" | "afil" | "extra" | "loja" | "todos" | "termos", string>>;

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const n = (v: string | undefined) => (v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined);
const num = (v: number, casas = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export default async function GarimpoPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const sp = await searchParams;
  const ordem = (sp.ordem && sp.ordem in ORDENS ? sp.ordem : "garimpo") as Ordem;
  const f = { min: n(sp.min) ?? 10, ganho: n(sp.ganho), precoMin: n(sp.precoMin), precoMax: n(sp.precoMax), vendas: n(sp.vendas), nota: n(sp.nota), nova: n(sp.nova), afil: n(sp.afil) };
  const [itens, termos, jaTenho, trabalho] = await Promise.all([
    db.select().from(garimpoItens).where(gte(garimpoItens.vistoEm, new Date(Date.now() - 3 * 86400_000))).orderBy(desc(garimpoItens.vendas)).limit(6000),
    termosGarimpo(),
    db.select({ itemId: afiliadosProdutos.itemId }).from(afiliadosProdutos),
    garimpoEmAndamento(),
  ]);
  const meus = new Set(jaTenho.map((x) => x.itemId));
  const busca = sp.q ? semAcento(sp.q).split(/\s+/).filter(Boolean) : [];
  const agora = Date.now();
  const lista = itens
    .map((i) => {
      const dias = i.extras?.ofertaDesde ? Math.max(0, (agora - new Date(i.extras.ofertaDesde).getTime()) / 86400_000) : null;
      const ganho = i.preco * i.comissao;
      const af = afiliadosEstimados(i);
      const giro = i.velocidade * 30 + Math.sqrt(i.vendas);
      return { ...i, dias, ganho, af, score: (ganho * giro) / ((af.de + af.ate) / 2) };
    })
    .filter(
      (i) =>
        (sp.todos || !meus.has(i.itemId)) &&
        i.comissao * 100 >= f.min &&
        (f.ganho == null || i.ganho >= f.ganho) &&
        (f.precoMin == null || i.preco >= f.precoMin) &&
        (f.precoMax == null || i.preco <= f.precoMax) &&
        (f.vendas == null || i.vendas >= f.vendas) &&
        (f.nota == null || i.avaliacao >= f.nota) &&
        (f.nova == null || (i.dias != null && i.dias <= f.nova)) &&
        (f.afil == null || i.af.ate <= f.afil) &&
        (!sp.extra || (i.extras?.comissaoVendedor ?? 0) > 0) &&
        (!sp.loja || (i.extras?.tiposLoja?.length ?? 0) > 0) &&
        (!sp.termo || i.termo === sp.termo) &&
        busca.every((w) => semAcento(i.nome).includes(w)),
    )
    .sort((a, b) => {
      switch (ordem) {
        case "afiliados":
          return a.af.ate - b.af.ate || b.ganho - a.ganho;
        case "nova":
          return (a.dias ?? 9999) - (b.dias ?? 9999);
        case "ganho":
          return b.ganho - a.ganho;
        case "comissao":
          return b.comissao - a.comissao || b.vendas - a.vendas;
        case "velocidade":
          return b.velocidade - a.velocidade;
        case "vendas":
          return b.vendas - a.vendas;
        default:
          return b.score - a.score;
      }
    });
  const mostrados = lista.slice(0, 80);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["ok", "erro", "termos"].includes(k)) as [string, string][]).toString();
  const aqui = `/afiliados/garimpo${qs ? `?${qs}` : ""}`;
  const filtrosAtivos = Object.entries(sp).filter(([k, v]) => v && !["ok", "erro", "ordem", "termos"].includes(k)).length;
  const ativos = termos.filter((t) => t.ativo);

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} verificar={garimpoEmAndamento} />
      <Link href="/afiliados" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Afiliados
      </Link>
      <PageHeader
        title="Garimpo automático"
        description="Shopee: produtos que pagam bem, vendem e têm poucos afiliados. Atualiza sozinho a cada 4 h."
        actions={
          <form action={garimparAgora}>
            <SubmitButton variant="gold" pendingText="Garimpando..." disabled={Boolean(trabalho)}>
              <Radar /> Garimpar agora
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-5">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}

        <details className="rounded-2xl border border-border bg-surface" open={Boolean(sp.termos) || !ativos.length}>
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            O que garimpar ({ativos.length} termo{ativos.length === 1 ? "" : "s"} seus + os mais vendidos pelos afiliados agora)
          </summary>
          <div className="grid gap-3 border-t border-border p-5">
            <form action={adicionarTermoGarimpo} className="flex flex-wrap gap-2">
              <Input name="termo" placeholder="Ex.: air fryer, organizador de cozinha, kit maquiagem (vírgula separa vários)" className="min-w-0 flex-1" />
              <SubmitButton pendingText="Adicionando...">
                <Plus /> Garimpar este
              </SubmitButton>
            </form>
            <div className="flex flex-wrap gap-2">
              {termos.map((t) => (
                <span key={t.id} className={`inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm ${t.ativo ? "border-border bg-surface-2" : "border-dashed border-border text-muted"}`}>
                  {t.termo}
                  <form action={alternarTermoGarimpo.bind(null, t.id, !t.ativo)}>
                    <button type="submit" className="rounded-full p-1 text-muted hover:text-gold" title={t.ativo ? "Pausar" : "Garimpar de novo"}>
                      {t.ativo ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </form>
                  <form action={excluirTermoGarimpo.bind(null, t.id)}>
                    <button type="submit" className="rounded-full p-1 text-muted hover:text-red" title="Excluir">
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </span>
              ))}
              {!termos.length ? <p className="text-sm text-muted">Sem termos ainda: por enquanto o garimpo usa só a lista dos mais vendidos pelos afiliados.</p> : null}
            </div>
          </div>
        </details>

        <details className="rounded-2xl border border-border bg-surface" open={filtrosAtivos > 0}>
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 font-semibold">
            <Filter className="size-4 text-gold" /> Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
            {filtrosAtivos ? (
              <Link href="/afiliados/garimpo" className="ml-auto inline-flex items-center gap-1 text-sm font-normal text-muted hover:text-gold">
                <X className="size-4" /> limpar
              </Link>
            ) : null}
          </summary>
          <form className="grid grid-cols-2 gap-3 border-t border-border p-5 sm:grid-cols-3 lg:grid-cols-6">
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-muted uppercase sm:col-span-3 lg:col-span-2">
              Buscar no nome
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="ex.: natal, fone" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Ordenar
              <Select name="ordem" defaultValue={ordem}>
                {Object.entries(ORDENS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Termo
              <Select name="termo" defaultValue={sp.termo ?? ""}>
                <option value="">Todos</option>
                <option value={EM_ALTA}>Em alta entre afiliados</option>
                {termos.map((t) => (
                  <option key={t.id} value={t.termo}>
                    {t.termo}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Afiliados (estim.)
              <Select name="afil" defaultValue={sp.afil ?? ""}>
                <option value="">Qualquer</option>
                <option value="5">Até 5</option>
                <option value="10">Até 10</option>
                <option value="25">Até 25</option>
                <option value="50">Até 50</option>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Oferta nova
              <Select name="nova" defaultValue={sp.nova ?? ""}>
                <option value="">Qualquer</option>
                <option value="3">Até 3 dias</option>
                <option value="7">Até 7 dias</option>
                <option value="15">Até 15 dias</option>
                <option value="30">Até 30 dias</option>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Comissão mín. (%)
              <Input name="min" inputMode="decimal" defaultValue={sp.min ?? "10"} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Ganho mín. (R$)
              <Input name="ganho" inputMode="decimal" defaultValue={sp.ganho ?? ""} placeholder="por venda" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Preço mín.
              <Input name="precoMin" inputMode="decimal" defaultValue={sp.precoMin ?? ""} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Preço máx.
              <Input name="precoMax" inputMode="decimal" defaultValue={sp.precoMax ?? ""} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Vendas mín.
              <Input name="vendas" inputMode="numeric" defaultValue={sp.vendas ?? ""} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Avaliação
              <Select name="nota" defaultValue={sp.nota ?? ""}>
                <option value="">Qualquer</option>
                <option value="4.5">4,5+</option>
                <option value="4.7">4,7+</option>
                <option value="4.9">4,9+</option>
              </Select>
            </label>
            <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-2 text-sm sm:col-span-3 lg:col-span-4">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="extra" value="1" defaultChecked={Boolean(sp.extra)} className="size-4" /> Comissão extra do vendedor
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="loja" value="1" defaultChecked={Boolean(sp.loja)} className="size-4" /> Shopee Mall / indicada
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="todos" value="1" defaultChecked={Boolean(sp.todos)} className="size-4" /> Mostrar os que já divulgo
              </label>
            </div>
            <div className="col-span-2 flex items-end sm:col-span-3 lg:col-span-2">
              <button type="submit" className={buttonClass("primary", "md", "w-full")}>
                <Filter /> Aplicar
              </button>
            </div>
          </form>
        </details>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Gem className="size-5 text-gold" /> {lista.length} achado(s)
              </span>
            }
            description="Afiliados = estimativa (a Shopee não informa esse número em lugar nenhum): vendas, idade da oferta e comissão."
          />
          {mostrados.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {mostrados.map((i) => (
                <div key={i.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
                  <div className="relative">
                    <FotoAmpliavel src={i.imagem} alt={i.nome} className="aspect-square w-full rounded-none" />
                    {i.velocidade >= 1 ? (
                      <Badge tone="red" className="pointer-events-none absolute top-2 right-2 bg-red text-white">
                        <Flame className="size-3" /> {num(i.velocidade, 1)}/dia
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid flex-1 content-start gap-2 p-3">
                    <a href={i.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-semibold hover:text-gold">
                      {i.nome} <ExternalLink className="inline size-3 text-muted" />
                    </a>
                    <p className="text-xs text-muted">
                      <span className="text-base font-extrabold text-foreground">{formatBRL(i.preco)}</span> · {num(i.vendas)} vendas
                      {i.avaliacao ? (
                        <>
                          {" "}
                          · <Star className="inline size-3" /> {num(i.avaliacao, 1)}
                        </>
                      ) : null}
                    </p>
                    <div className="grid gap-1.5 rounded-lg bg-surface-2 p-2 text-xs">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-muted">Comissão</span>
                        <span>
                          <b className="text-gold">{num(i.comissao * 100, 1)}%</b> <span className="text-muted">· {formatBRL(i.ganho)}/venda</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2" title="Estimativa: a Shopee não informa quantos afiliados divulgam o produto">
                        <span className="text-muted">Afiliados (estim.)</span>
                        <b className={`inline-flex items-center gap-1 ${i.af.nivel === "baixa" ? "text-green" : i.af.nivel === "média" ? "text-gold" : "text-red"}`}>
                          <Users className="size-3" /> ≈ {i.af.de}–{i.af.ate}
                        </b>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {i.dias != null ? <Badge tone={i.dias <= 7 ? "green" : "neutral"}>{i.dias < 1 ? "oferta de hoje" : `oferta há ${Math.round(i.dias)} d`}</Badge> : null}
                      {i.extras?.comissaoVendedor ? <Badge tone="gold">+{num(i.extras.comissaoVendedor * 100, 1)}% vendedor</Badge> : null}
                      {i.extras?.tiposLoja?.length ? <Badge>{i.extras.tiposLoja[0]}</Badge> : null}
                    </div>
                    <div className="mt-auto grid gap-1.5 pt-1">
                      <form action={divulgarProduto.bind(null, i.itemId, i.lojaId, aqui)}>
                        <SubmitButton size="sm" className="w-full" pendingText="Gerando link...">
                          <Plus /> Divulgar
                        </SubmitButton>
                      </form>
                      <form action={linkRapido.bind(null, i.link, aqui)}>
                        <SubmitButton size="sm" variant="outline" className="w-full" pendingText="...">
                          <Link2 /> Só o link
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Gem />} title={itens.length ? "Nada com esses filtros" : "Nada garimpado ainda"} description={itens.length ? "Afrouxe algum filtro." : "Clique em Garimpar agora."} />
          )}
        </Card>
      </div>
    </>
  );
}
