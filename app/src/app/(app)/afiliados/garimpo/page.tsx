import { and, desc, eq, gte } from "drizzle-orm";
import { ArrowLeft, Filter, Gem, Link2, Plus, Radar, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos, sentinelaItens } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";
import { coletarAgora, divulgarProduto, linkRapido, trabalhoEmAndamento } from "../../sentinela/actions";
import { AtualizarSozinho } from "../../sentinela/atualizar";
import { ItemCard, type ItemSentinela } from "../../sentinela/item-card";

export const metadata: Metadata = { title: "Garimpo de afiliados" };

const ORDENS = {
  garimpo: "Garimpo (melhor no geral)",
  concorrencia: "Menos concorrência",
  nova: "Oferta mais nova",
  ganho: "Maior ganho por venda",
  comissao: "Maior comissão (%)",
  velocidade: "Vendendo mais rápido",
  vendas: "Mais vendidos",
} as const;
type Ordem = keyof typeof ORDENS;

type Params = {
  ok?: string;
  erro?: string;
  ordem?: string;
  q?: string;
  termo?: string;
  min?: string;
  ganho?: string;
  precoMin?: string;
  precoMax?: string;
  vendas?: string;
  nota?: string;
  nova?: string;
  conc?: string;
  extra?: string;
  loja?: string;
  todos?: string;
};

/** Chave de "produto parecido": as 3 primeiras palavras relevantes do nome. */
const chave = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["kit", "com", "para", "de", "unid", "pcs", "und"].includes(w))
    .slice(0, 3)
    .join(" ");
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const n = (v: string | undefined) => (v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined);

export default async function GarimpoPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const sp = await searchParams;
  const ordem = (sp.ordem && sp.ordem in ORDENS ? sp.ordem : "garimpo") as Ordem;
  const f = {
    min: n(sp.min) ?? 10,
    ganho: n(sp.ganho),
    precoMin: n(sp.precoMin),
    precoMax: n(sp.precoMax),
    vendas: n(sp.vendas),
    nota: n(sp.nota),
    nova: n(sp.nova),
    conc: n(sp.conc),
  };
  const [itens, termos, jaTenho, trabalho] = await Promise.all([
    db
      .select()
      .from(sentinelaItens)
      .where(and(eq(sentinelaItens.fonte, "shopee"), gte(sentinelaItens.vistoEm, new Date(Date.now() - 3 * 86400_000))))
      .orderBy(desc(sentinelaItens.vendas))
      .limit(5000),
    db.selectDistinct({ termo: sentinelaItens.termo }).from(sentinelaItens).where(eq(sentinelaItens.fonte, "shopee")).orderBy(sentinelaItens.termo),
    db.select({ itemId: afiliadosProdutos.itemId }).from(afiliadosProdutos),
    trabalhoEmAndamento(),
  ]);
  const meus = new Set(jaTenho.map((x) => x.itemId));
  // Lojas diferentes vendendo um produto de nome parecido, entre tudo o que as sentinelas viram.
  const lojasPorChave = new Map<string, Set<string>>();
  for (const i of itens) {
    const k = chave(i.nome);
    if (!lojasPorChave.has(k)) lojasPorChave.set(k, new Set());
    lojasPorChave.get(k)!.add(i.lojaId);
  }
  const busca = sp.q ? semAcento(sp.q).split(/\s+/).filter(Boolean) : [];
  const agora = Date.now();
  const todos = itens.map((i) => {
    const lojas = lojasPorChave.get(chave(i.nome))?.size ?? 1;
    const diasOferta = i.extras?.ofertaDesde ? Math.max(0, (agora - new Date(i.extras.ofertaDesde).getTime()) / 86400_000) : null;
    const ganho = i.preco * i.comissao;
    const giro = i.velocidade * 30 + Math.sqrt(i.vendas);
    // A Shopee não diz quantos afiliados divulgam o produto. Estimativa: quanto mais vendido, mais antiga a oferta
    // e mais lojas parecidas, mais afiliados já estão nele.
    const pressao = lojas * (1 + (diasOferta ?? 60) / 30) * (1 + Math.log10(1 + i.vendas) / 2);
    const nivel = pressao < 3 ? "baixa" : pressao < 8 ? "média" : "alta";
    return { ...i, lojas, diasOferta, ganho, giro, pressao, nivel, score: (ganho * giro) / pressao };
  });
  const lista = todos
    .filter(
      (i) =>
        (sp.todos || !meus.has(i.idExterno)) &&
        i.comissao * 100 >= f.min &&
        (f.ganho == null || i.ganho >= f.ganho) &&
        (f.precoMin == null || i.preco >= f.precoMin) &&
        (f.precoMax == null || i.preco <= f.precoMax) &&
        (f.vendas == null || i.vendas >= f.vendas) &&
        (f.nota == null || i.avaliacao >= f.nota) &&
        (f.nova == null || (i.diasOferta != null && i.diasOferta <= f.nova)) &&
        (f.conc == null || i.lojas <= f.conc) &&
        (!sp.extra || (i.extras?.comissaoVendedor ?? 0) > 0) &&
        (!sp.loja || (i.extras?.tiposLoja?.length ?? 0) > 0) &&
        (!sp.termo || i.termo === sp.termo) &&
        busca.every((w) => semAcento(i.nome).includes(w)),
    )
    .sort((a, b) => {
      switch (ordem) {
        case "concorrencia":
          return a.pressao - b.pressao || b.ganho - a.ganho;
        case "nova":
          return (a.diasOferta ?? 9999) - (b.diasOferta ?? 9999);
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
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["ok", "erro"].includes(k)) as [string, string][]).toString();
  const aqui = `/afiliados/garimpo${qs ? `?${qs}` : ""}`;
  const filtrosAtivos = Object.entries(sp).filter(([k, v]) => v && !["ok", "erro", "ordem"].includes(k)).length;

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} />
      <Link href="/afiliados" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Afiliados
      </Link>
      <PageHeader
        title="Garimpo automático"
        description="As sentinelas leem a Shopee a cada 4 h. Aqui ficam os produtos que pagam bem, vendem e têm pouca gente divulgando. Os que você já divulga não aparecem."
        actions={
          <form action={coletarAgora}>
            <SubmitButton variant="gold" pendingText="Garimpando..." disabled={Boolean(trabalho)}>
              <Radar /> Garimpar agora
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        {trabalho ? <Alert tone="gold">Garimpando a Shopee agora… a página atualiza sozinha.</Alert> : null}

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Filter className="size-4 text-gold" /> Filtros
              </span>
            }
            action={
              filtrosAtivos ? (
                <Link href="/afiliados/garimpo" className={buttonClass("ghost", "sm")}>
                  <X /> Limpar ({filtrosAtivos})
                </Link>
              ) : null
            }
          />
          <form className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <label className="col-span-2 grid gap-1 text-xs font-semibold text-muted uppercase sm:col-span-3 lg:col-span-2">
              Buscar no nome
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="ex.: natal, organizador, fone" />
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
              Nicho
              <Select name="termo" defaultValue={sp.termo ?? ""}>
                <option value="">Todos</option>
                {termos.map((t) => (
                  <option key={t.termo} value={t.termo}>
                    {t.termo}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Concorrência
              <Select name="conc" defaultValue={sp.conc ?? ""}>
                <option value="">Qualquer</option>
                <option value="1">Só 1 loja (exclusivo)</option>
                <option value="2">Até 2 lojas parecidas</option>
                <option value="3">Até 3</option>
                <option value="5">Até 5</option>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Oferta nova
              <Select name="nova" defaultValue={sp.nova ?? ""}>
                <option value="">Qualquer</option>
                <option value="3">Começou há até 3 dias</option>
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
              Ganho mín. (R$/venda)
              <Input name="ganho" inputMode="decimal" defaultValue={sp.ganho ?? ""} placeholder="ex.: 5" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Preço mín. (R$)
              <Input name="precoMin" inputMode="decimal" defaultValue={sp.precoMin ?? ""} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Preço máx. (R$)
              <Input name="precoMax" inputMode="decimal" defaultValue={sp.precoMax ?? ""} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Vendas mín.
              <Input name="vendas" inputMode="numeric" defaultValue={sp.vendas ?? ""} placeholder="ex.: 100" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Avaliação mín.
              <Select name="nota" defaultValue={sp.nota ?? ""}>
                <option value="">Qualquer</option>
                <option value="4.5">4,5+</option>
                <option value="4.7">4,7+</option>
                <option value="4.9">4,9+</option>
              </Select>
            </label>
            <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-3 lg:col-span-4">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="extra" value="1" defaultChecked={Boolean(sp.extra)} className="size-4 accent-[var(--color-gold)]" /> Só com comissão extra do vendedor
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="loja" value="1" defaultChecked={Boolean(sp.loja)} className="size-4 accent-[var(--color-gold)]" /> Só Shopee Mall / loja indicada
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="todos" value="1" defaultChecked={Boolean(sp.todos)} className="size-4 accent-[var(--color-gold)]" /> Mostrar os que já divulgo
              </label>
            </div>
            <div className="col-span-2 flex items-end justify-end sm:col-span-3 lg:col-span-2">
              <button type="submit" className={buttonClass("primary", "md", "w-full")}>
                <Filter /> Aplicar filtros
              </button>
            </div>
          </form>
        </Card>

        <Alert tone="blue">
          A Shopee não informa quantos afiliados divulgam cada produto: esse número não existe na API (conferido em todos os campos). A{" "}
          <b>concorrência estimada</b> junta três sinais que a API dá: quantas lojas vendem produto parecido, há quantos dias a oferta de comissão existe
          (oferta nova = pouca gente sabendo) e quanto já vendeu (muito vendido = muito afiliado em cima).
        </Alert>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Gem className="size-5 text-gold" /> {lista.length} achado(s)
                {lista.length > mostrados.length ? <span className="text-sm font-normal text-muted">(mostrando os {mostrados.length} primeiros)</span> : null}
              </span>
            }
          />
          {mostrados.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {mostrados.map((i) => (
                <ItemCard
                  key={i.id}
                  i={i as ItemSentinela}
                  semIa
                  acao={
                    <div className="grid gap-1.5">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <Badge tone="green">ganha {formatBRL(i.ganho)}/venda</Badge>
                        <Badge tone={i.nivel === "baixa" ? "green" : i.nivel === "média" ? "gold" : "red"} title={`${i.lojas} loja(s) parecida(s)`}>
                          concorrência {i.nivel}
                        </Badge>
                        {i.diasOferta != null ? (
                          <Badge tone={i.diasOferta <= 7 ? "green" : "neutral"}>{i.diasOferta < 1 ? "oferta de hoje" : `oferta há ${Math.round(i.diasOferta)} dia(s)`}</Badge>
                        ) : null}
                        {i.extras?.comissaoVendedor ? <Badge tone="gold">+{(i.extras.comissaoVendedor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do vendedor</Badge> : null}
                        {i.extras?.comissaoNovo && i.extras.comissaoNovo > i.comissao ? (
                          <Badge tone="blue">{(i.extras.comissaoNovo * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% cliente novo</Badge>
                        ) : null}
                        {i.extras?.tiposLoja?.length ? <Badge>{i.extras.tiposLoja[0]}</Badge> : null}
                        {i.avaliacao ? <Badge>★ {i.avaliacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</Badge> : null}
                      </div>
                      <form action={divulgarProduto.bind(null, i.idExterno, i.lojaId, aqui)}>
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
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Gem />} title="Nada com esses filtros" description="Afrouxe algum filtro ou clique em Garimpar agora." />
          )}
        </Card>
      </div>
    </>
  );
}
