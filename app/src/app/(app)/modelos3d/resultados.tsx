"use client";

import { Download, ExternalLink, Heart, Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { MarcaIcone } from "@/components/marca";
import { BotaoCadastrarTudo, ProgressoCadastro } from "@/components/modelos-achados";
import { Badge, Button, buttonClass, Card, Input, Select } from "@/components/ui";
import { FONTES_MODELO, NOMES_FONTE, type CanalMercado, type FonteModelo, type MercadoCanal, type pesquisaModelosItens } from "@/db/schema";
import type { EstadoCadastro } from "@/lib/cadastro-modelos";
import { cn, formatBRL } from "@/lib/utils";
import type { HitThingiverse } from "@/lib/modelos3d";
import { analisarDeNovo, andamentoPesquisa, resultadoThingiverse, thingiversePeloNavegador } from "./actions";

type Item = typeof pesquisaModelosItens.$inferSelect;
const CANAIS: CanalMercado[] = ["magalu", "mercadolivre", "shopee"];
const NOMES: Record<CanalMercado, string> = { magalu: "Magalu", mercadolivre: "Mercado Livre", shopee: "Shopee" };
const num = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`);

type Ordem = "vendidos" | "lucro" | "barato" | "caro" | "menosConcorrentes" | "maisConcorrentes" | "baixados";
const ORDENS: [Ordem, string][] = [
  ["vendidos", "Mais vendidos nas plataformas"],
  ["lucro", "Maior lucro para concorrer"],
  ["barato", "Menor preço de mercado"],
  ["caro", "Maior preço de mercado"],
  ["menosConcorrentes", "Menos concorrentes"],
  ["maisConcorrentes", "Mais concorrentes"],
  ["baixados", "Mais baixados nos sites 3D"],
];

const canaisDe = (plat: CanalMercado | "todas") => (plat === "todas" ? CANAIS : [plat]);
const dados = (i: Item, plat: CanalMercado | "todas") => canaisDe(plat).map((c) => i.mercado?.[c]).filter((x): x is MercadoCanal => Boolean(x));
const vendasDe = (i: Item, plat: CanalMercado | "todas") => dados(i, plat).reduce((s, m) => s + m.vendas, 0);
const anunciosDe = (i: Item, plat: CanalMercado | "todas") => dados(i, plat).reduce((s, m) => s + m.anuncios, 0);
const lucroDe = (i: Item, plat: CanalMercado | "todas") => Math.max(-Infinity, ...dados(i, plat).map((m) => m.lucro ?? -Infinity));
/** Preço de referência do mercado: a mediana da plataforma (ou a menor mediana entre as que têm concorrente). */
function precoDe(i: Item, plat: CanalMercado | "todas") {
  const ps = dados(i, plat)
    .map((m) => m.mediana)
    .filter((v) => v > 0);
  return ps.length ? Math.min(...ps) : 0;
}

export function ResultadosPesquisa({
  pesquisaId,
  termo,
  inicial,
  andamento,
  fontes: fontesIniciais,
}: {
  pesquisaId: number;
  termo: string;
  inicial: Item[];
  andamento: EstadoCadastro | null;
  fontes: Partial<Record<FonteModelo, string>>;
}) {
  const [itens, setItens] = useState(inicial);
  const [fontes, setFontes] = useState(fontesIniciais);
  // O Thingiverse bloqueia o servidor (Cloudflare): a pesquisa dele sai do seu navegador, uma vez por pesquisa.
  useEffect(() => {
    if (!/bloqueia|bloqueou/.test(fontesIniciais.thingiverse ?? "") || /navegador/.test(fontesIniciais.thingiverse ?? "")) return;
    let parado = false;
    (async () => {
      const pedido = await thingiversePeloNavegador(pesquisaId).catch(() => null);
      if (!pedido || parado) return;
      setFontes((f) => ({ ...f, thingiverse: "pesquisando pelo seu navegador..." }));
      const tk = `access_token=${encodeURIComponent(pedido.token)}`;
      let hits: HitThingiverse[] | null = null;
      let erro = "";
      try {
        const r = await fetch(`https://api.thingiverse.com/search/${encodeURIComponent(pedido.termo)}/?type=things&per_page=30&sort=popular&${tk}`);
        if (!r.ok) throw new Error(`resposta ${r.status}`);
        const j = (await r.json()) as { hits?: HitThingiverse[] };
        hits = j.hits ?? [];
        // Licença e descrição de cada um (a busca não traz): o que der, em paralelo.
        const detalhes = await Promise.all(
          hits.slice(0, 30).map((h) =>
            fetch(`https://api.thingiverse.com/things/${h.id}?${tk}`)
              .then((x) => (x.ok ? (x.json() as Promise<{ license?: string; description?: string; description_html?: string }>) : null))
              .catch(() => null),
          ),
        );
        hits = hits.map((h, n) => ({ ...h, license: detalhes[n]?.license ?? h.license, description: detalhes[n]?.description_html || detalhes[n]?.description || h.description }));
      } catch (e) {
        erro = (e as Error).message || "sem resposta";
      }
      if (parado) return;
      const novos = await resultadoThingiverse(pesquisaId, hits, erro).catch(() => null);
      if (novos) setItens(novos);
      setFontes((f) => ({ ...f, thingiverse: hits ? `${hits.length} modelo(s) (pelo seu navegador)` : "bloqueado também pelo navegador" }));
    })();
    return () => {
      parado = true;
    };
  }, [pesquisaId, fontesIniciais.thingiverse]);
  const pendentes = itens.filter((i) => i.status === "pendente").length;
  // Enquanto há modelos em análise, busca os resultados novos a cada 6 s (sem recarregar a página).
  useEffect(() => {
    if (!pendentes) return;
    const t = setInterval(async () => {
      const r = await andamentoPesquisa(pesquisaId).catch(() => null);
      if (r) setItens(r);
    }, 6000);
    return () => clearInterval(t);
  }, [pendentes, pesquisaId]);

  const [licenca, setLicenca] = useState<"todas" | "vende" | "naoVende">("todas");
  const [site, setSite] = useState<FonteModelo | "todos">("todos");
  const [plat, setPlat] = useState<CanalMercado | "todas">("todas");
  const [soVendendo, setSoVendendo] = useState(false);
  const [precoMin, setPrecoMin] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("vendidos");
  const [vigiar, setVigiar] = useState(0);
  // Ordem guardada (ids): congelada na primeira vez e a cada troca de ordem/filtro; null = calcular agora.
  const [ordemFixa, setOrdemFixa] = useState<number[] | null>(null);
  const [prontosAoOrdenar, setProntosAoOrdenar] = useState(0);
  useEffect(() => setOrdemFixa(null), [licenca, site, plat, soVendendo, precoMin, precoMax, ordem]);

  const lista = useMemo(() => {
    const min = Number(precoMin.replace(",", ".")) || 0;
    const max = Number(precoMax.replace(",", ".")) || Infinity;
    const f = itens.filter((i) => {
      if (licenca === "vende" && i.modelo.comercial !== true) return false;
      if (licenca === "naoVende" && i.modelo.comercial !== false) return false;
      if (site !== "todos" && i.modelo.fonte !== site) return false;
      if (i.status !== "pronto") return !soVendendo && !precoMin && !precoMax;
      if (soVendendo && !anunciosDe(i, plat)) return false;
      const p = precoDe(i, plat);
      if ((min || max !== Infinity) && (!p || p < min || p > max)) return false;
      return true;
    });
    const chave: Record<Ordem, (i: Item) => number> = {
      vendidos: (i) => vendasDe(i, plat) * 1000 + anunciosDe(i, plat),
      lucro: (i) => lucroDe(i, plat),
      barato: (i) => -(precoDe(i, plat) || Infinity),
      caro: (i) => precoDe(i, plat),
      menosConcorrentes: (i) => -(anunciosDe(i, plat) || Infinity),
      maisConcorrentes: (i) => anunciosDe(i, plat),
      baixados: (i) => i.modelo.downloads,
    };
    const ordenada = [...f].sort((a, b) => (a.status === "pronto" ? 0 : 1) - (b.status === "pronto" ? 0 : 1) || chave[ordem](b) - chave[ordem](a));
    // Ordem fixa enquanto a análise termina: o modelo que fica pronto não pula para o topo (a tela não mexe sozinha).
    // Só reordena quando você troca a ordem/filtros ou toca em "Reordenar".
    if (!ordemFixa) return ordenada;
    const pos = new Map(ordemFixa.map((id, n) => [id, n]));
    return [...f].sort((a, b) => (pos.get(a.id) ?? 1e9 + a.posicao) - (pos.get(b.id) ?? 1e9 + b.posicao));
  }, [itens, licenca, site, plat, soVendendo, precoMin, precoMax, ordem, ordemFixa]);

  useEffect(() => {
    if (ordemFixa) return;
    setOrdemFixa(lista.map((i) => i.id));
    setProntosAoOrdenar(itens.length - pendentes);
  }, [ordemFixa, lista, itens.length, pendentes]);
  const prontos = itens.length - pendentes;
  // Ficaram prontos modelos depois de ordenar: o botão reordena quando você quiser.
  const foraDeOrdem = Boolean(ordemFixa) && prontos > prontosAoOrdenar;
  const vendaveis = itens.filter((i) => i.modelo.comercial === true).length;
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            <b>“{termo}”</b>: {itens.length} modelos ({vendaveis} com licença que deixa vender, {itens.length - vendaveis} não ou a conferir)
          </span>
          {pendentes ? (
            <span className="inline-flex items-center gap-1.5 text-gold">
              <Loader2 className="size-4 animate-spin" /> analisando o mercado: {prontos} de {itens.length}
            </span>
          ) : (
            <Badge tone="green">mercado analisado</Badge>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {FONTES_MODELO.map((f) => {
            const st = fontes[f] ?? "não pesquisado";
            const ok = /^\d/.test(st);
            return (
              <span key={f} className={cn("rounded-full border px-2 py-0.5", ok ? "border-green/40 text-green" : "border-border text-muted")} title={st}>
                {NOMES_FONTE[f]}: {st}
                {/chave/.test(st) ? (
                  <a href="/configuracoes?aba=integracoes" className="ml-1 underline">
                    cadastrar
                  </a>
                ) : null}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gold/10 p-3">
          <BotaoCadastrarTudo modelos={lista.map((i) => i.modelo)} rotulo="Cadastrar todos" grande aoIniciar={() => setVigiar((v) => v + 1)} />
          <span className="text-xs text-muted">
            Cadastra como produto todos os modelos mostrados (com os filtros abaixo). Os já cadastrados são pulados; os de licença não comercial entram com o anúncio
            bloqueado até você confirmar a licença no produto.
          </span>
        </div>
        {pendentes ? (
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-gold transition-all" style={{ width: `${Math.round((prontos / Math.max(1, itens.length)) * 100)}%` }} />
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select aria-label="Site" value={site} onChange={(e) => setSite(e.target.value as typeof site)}>
            <option value="todos">Todos os sites</option>
            {FONTES_MODELO.filter((f) => itens.some((i) => i.modelo.fonte === f)).map((f) => (
              <option key={f} value={f}>
                {NOMES_FONTE[f]} ({itens.filter((i) => i.modelo.fonte === f).length})
              </option>
            ))}
          </Select>
          <Select aria-label="Licença" value={licenca} onChange={(e) => setLicenca(e.target.value as typeof licenca)}>
            <option value="todas">Todas as licenças</option>
            <option value="vende">Só os que pode vender</option>
            <option value="naoVende">Só os que não pode vender</option>
          </Select>
          <Select aria-label="Plataforma" value={plat} onChange={(e) => setPlat(e.target.value as typeof plat)}>
            <option value="todas">Todas as plataformas</option>
            {CANAIS.map((c) => (
              <option key={c} value={c}>
                {NOMES[c]}
              </option>
            ))}
          </Select>
          <Input aria-label="Preço mínimo de mercado" inputMode="decimal" placeholder="Preço de R$" value={precoMin} onChange={(e) => setPrecoMin(e.target.value)} />
          <Input aria-label="Preço máximo de mercado" inputMode="decimal" placeholder="até R$" value={precoMax} onChange={(e) => setPrecoMax(e.target.value)} />
          <Select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="sm:col-span-2">
            {ORDENS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soVendendo} onChange={(e) => setSoVendendo(e.target.checked)} className="size-4 accent-[var(--gold)]" />
            Só os que já têm anúncio{plat === "todas" ? " em alguma plataforma" : ` no ${NOMES[plat]}`}
          </label>
        </div>
        <p className="text-xs text-muted">
          {foraDeOrdem ? (
            <button type="button" onClick={() => setOrdemFixa(null)} className="mr-2 inline-flex items-center gap-1 font-semibold text-gold hover:underline">
              <RefreshCw className="size-3.5" /> Reordenar pelos resultados
            </button>
          ) : null}
          Mostrando {lista.length} de {itens.length}. O preço de mercado é a mediana dos anúncios parecidos; o preço para concorrer fica um pouco abaixo dela, sem passar do
          seu mínimo.
        </p>
        <ProgressoCadastro inicial={andamento} vigiar={vigiar} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {lista.map((i) => (
          <CartaoPesquisa key={i.id} i={i} plat={plat} aoReanalisar={() => setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: "pendente" } : x)))} />
        ))}
      </div>
    </div>
  );
}

function CartaoPesquisa({ i, plat, aoReanalisar }: { i: Item; plat: CanalMercado | "todas"; aoReanalisar: () => void }) {
  const m = i.modelo;
  const d = i.detalhe;
  const [reanalisando, iniciar] = useTransition();
  return (
    <Card className={cn("grid content-start gap-3 p-4", m.comercial === false && "border-red/30")}>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
        {m.imagem ? (
          <FotoAmpliavel src={m.imagem} alt={m.titulo} className="aspect-square w-full rounded-lg bg-surface-2 object-cover" />
        ) : (
          <div className="aspect-square rounded-lg bg-surface-2" />
        )}
        <div className="grid min-w-0 content-start gap-1">
          <p className="line-clamp-2 font-semibold">{m.titulo}</p>
          <p className="text-[11px] text-muted">
            {NOMES_FONTE[m.fonte]}
            {m.autor ? ` · ${m.autor}` : ""} ·{" "}
            <span className="inline-flex items-center gap-0.5">
              <Download className="size-3" /> {num(m.downloads)}
            </span>{" "}
            <span className="inline-flex items-center gap-0.5">
              <Heart className="size-3" /> {num(m.curtidas)}
            </span>
          </p>
          <Badge tone={m.comercial === true ? "green" : m.comercial === false ? "red" : "neutral"} className="justify-self-start">
            {m.comercial === true ? "Pode vender" : m.comercial === false ? "Não pode vender" : "Licença: conferir"}
            {m.licenca ? ` · ${m.licenca}` : ""}
          </Badge>
          {d && d.pesoG ? (
            <p className="text-xs text-muted">
              {d.pesoG} g · {horas(d.tempoMin)}
              {d.cores > 1 ? ` · ${d.cores} cores` : ""} · custo <b className="text-foreground">{formatBRL(d.custo)}</b>
              {d.estimado ? " (estimado)" : ""}
            </p>
          ) : null}
        </div>
      </div>

      {i.status === "pendente" ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Analisando o mercado nas plataformas...
        </p>
      ) : i.status === "erro" ? (
        <p className="text-sm text-red">Não deu para analisar: {i.erro}</p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {canaisDe(plat).map((c) => {
            const x = i.mercado?.[c];
            if (!x) return null;
            return (
              <div key={c} className="grid gap-1 p-2.5 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <MarcaIcone canal={c} className="size-5" /> {NOMES[c]}
                </span>
                {x.anuncios ? (
                  <span className="grid gap-0.5">
                    <span>
                      {x.anuncios} anúncio(s) · {x.vendedores} vendedor(es)
                      {c === "shopee" && x.vendas ? ` · ${num(x.vendas)} vendidos` : ""}
                    </span>
                    <span className="text-muted">
                      {formatBRL(x.min)} a {formatBRL(x.max)} · mediana <b className="text-foreground">{formatBRL(x.mediana)}</b>
                    </span>
                    {x.concorrer ? (
                      <span className="font-semibold text-green">
                        Concorrer por {formatBRL(x.concorrer)} · lucro {formatBRL(x.lucro ?? 0)} por peça
                      </span>
                    ) : d?.custo ? (
                      <span className="font-semibold text-red">Não compensa: seu mínimo é {formatBRL(x.minimo)}</span>
                    ) : (
                      <span className="text-muted">Sem o peso do modelo para calcular o seu preço.</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted">
                    Ninguém vendendo parecido{x.sugerido ? `: espaço livre, sugerido ${formatBRL(x.sugerido)}` : ""}.
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {i.status === "pronto" && i.erro ? <p className="text-[11px] text-muted">Aviso: {i.erro}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        <Link href={`/produtos/modelo3d?link=${encodeURIComponent(m.link)}`} className={buttonClass(m.comercial === false ? "outline" : "gold", "sm")}>
          <Sparkles /> Cadastrar
        </Link>
        <a href={m.link} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
          <ExternalLink /> Ver no site
        </a>
        {i.status !== "pendente" ? (
          <Button type="button" variant="ghost" size="sm" disabled={reanalisando} onClick={() =>
              iniciar(async () => {
                await analisarDeNovo(i.id);
                aoReanalisar();
              })
            }>
            <RefreshCw /> {reanalisando ? "..." : "Analisar de novo"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
