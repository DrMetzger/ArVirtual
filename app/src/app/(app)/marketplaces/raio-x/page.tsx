import { Activity, Bot, ExternalLink, RefreshCw, ScanSearch, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Abas } from "@/components/abas";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { raioxAnuncios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { analisarRaioX, DIAGNOSTICOS, type Diagnostico, type LinhaRaioX } from "@/lib/raiox";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { Markdown } from "../../assistente/markdown";
import { AtualizarSozinho } from "../../sentinela/atualizar";
import { atualizarRaioX, planoIaAnuncio, raioxEmAndamento } from "./actions";

export const metadata: Metadata = { title: "Raio-X dos anúncios" };

const PLATAFORMAS = [
  ["magalu", "Magalu"],
  ["mercadolivre", "Mercado Livre"],
  ["shopee", "Shopee"],
] as const;
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const num = (n: number) => n.toLocaleString("pt-BR");

function Anuncio({ l, voltar }: { l: LinhaRaioX; voltar: string }) {
  const d = DIAGNOSTICOS[l.diagnostico];
  return (
    <div id={`a-${l.contaId}-${l.idExterno}`} className="grid gap-2 px-4 py-4">
      <div className="flex items-start gap-3">
        <FotoAmpliavel src={l.imagem} alt={l.titulo} className="size-16" />
        <div className="grid min-w-0 flex-1 gap-1">
          <a href={l.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-semibold hover:text-gold">
            {l.titulo} <ExternalLink className="inline size-3 text-muted" />
          </a>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={d.tom}>{d.nome}</Badge>
            {l.status === "pausado" ? <Badge>pausado</Badge> : null}
            {l.qualidade ? <Badge tone={l.qualidade.nota >= 80 ? "green" : l.qualidade.nota >= 60 ? "gold" : "red"}>qualidade ML {l.qualidade.nota}/100</Badge> : null}
            <span className="font-semibold">{formatBRL(l.preco)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-lg font-extrabold", l.saude >= 70 ? "text-green" : l.saude >= 45 ? "text-gold" : "text-red")}>{l.saude}</p>
          <p className="text-[10px] text-muted">saúde</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-surface-2 p-2 text-xs sm:grid-cols-4">
        <p>
          <span className="text-muted">Visitas</span>
          <br />
          <b>{l.visitas == null ? "—" : num(l.visitas)}</b> <span className="text-muted">{l.periodo === "30d" ? "30 dias" : l.periodo === "total" ? "total" : ""}</span>
        </p>
        <p>
          <span className="text-muted">Vendas</span>
          <br />
          <b>{l.periodo === "total" ? num(Math.max(l.vendasTotal ?? 0, l.vendas30)) : num(l.vendas30)}</b>{" "}
          <span className="text-muted">{l.periodo === "total" ? "total" : "30 dias"}</span>
        </p>
        <p>
          <span className="text-muted">Conversão</span>
          <br />
          <b>{pct(l.conversao)}</b> <span className="text-muted">ajust. {pct(l.conversaoAjustada)}</span>
        </p>
        <p>
          <span className="text-muted">Deixa de faturar</span>
          <br />
          <b className={l.ganho > 0 ? "text-red" : ""}>{l.ganho > 0 ? formatBRL(l.ganho) : "—"}</b> <span className="text-muted">{l.periodo === "30d" ? "/mês" : ""}</span>
        </p>
      </div>
      <p className="text-xs">
        <b>O que fazer:</b> {d.acao}
      </p>
      {l.melhorias.length ? (
        <ul className="ml-4 grid list-disc gap-0.5 text-xs text-muted">
          {l.melhorias.slice(0, 8).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {l.planoIa ? (
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm">
          <p className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-gold">
            <Bot className="size-3.5" /> Plano da IA
          </p>
          <Markdown texto={l.planoIa} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={planoIaAnuncio.bind(null, l.contaId, l.idExterno, voltar)}>
          <SubmitButton size="sm" variant="outline" pendingText="A IA está analisando...">
            <Bot /> {l.planoIa ? "Refazer plano da IA" : "Plano da IA"}
          </SubmitButton>
        </form>
        <Link href={`/sentinela/concorrencia?q=${encodeURIComponent(l.titulo.split(/\s+/).slice(0, 5).join(" "))}`} className={buttonClass("ghost", "sm")}>
          <Users /> Concorrência
        </Link>
      </div>
    </div>
  );
}

export default async function RaioXPage({ searchParams }: { searchParams: Promise<{ erro?: string; filtro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [todas, trabalho] = await Promise.all([db.select().from(raioxAnuncios), raioxEmAndamento()]);
  const { linhas, resumo } = analisarRaioX(todas);
  const atualizado = todas.reduce<Date | null>((m, l) => (!m || l.atualizadoEm < m ? l.atualizadoEm : m), null);
  const filtro = (sp.filtro && sp.filtro in DIAGNOSTICOS ? sp.filtro : "") as Diagnostico | "";

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} verificar={raioxEmAndamento} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            <ScanSearch className="size-7 text-gold" /> Raio-X dos anúncios
          </h1>
          <p className="mt-1 text-sm text-muted">
            Todos os seus anúncios: visitas, vendas, conversão e o que fazer em cada um, do que dá mais dinheiro para o que dá menos.
            {atualizado ? ` Lido em ${formatDate(atualizado)}.` : ""}
          </p>
        </div>
        <form action={atualizarRaioX}>
          <SubmitButton variant="gold" pendingText="Lendo as plataformas..." disabled={Boolean(trabalho)}>
            <RefreshCw /> Atualizar agora
          </SubmitButton>
        </form>
      </div>
      {sp.erro ? (
        <div className="mb-4">
          <Alert>{sp.erro}</Alert>
        </div>
      ) : null}
      {!todas.length ? (
        <EmptyState icon={<Activity />} title="Raio-X ainda não lido" description="Clique em Atualizar agora: em alguns minutos aparecem todos os seus anúncios." />
      ) : (
        <Abas
          abas={PLATAFORMAS.filter(([k]) => resumo[k]).map(([k, nome]) => {
            const r = resumo[k]!;
            const daqui = linhas.filter((l) => l.marketplace === k && (!filtro || l.diagnostico === filtro));
            const contagem = (d: Diagnostico) => linhas.filter((l) => l.marketplace === k && l.diagnostico === d).length;
            const voltar = `/marketplaces/raio-x${filtro ? `?filtro=${filtro}` : ""}`;
            return {
              id: k,
              rotulo: (
                <>
                  <MarcaIcone canal={k} className="size-5" /> {nome} ({r.ativos})
                </>
              ),
              conteudo: (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["Anúncios ativos", num(r.ativos)],
                      [`Visitas${r.periodo === "30d" ? " · 30 dias" : r.periodo === "total" ? " · total" : ""}`, r.visitas ? num(r.visitas) : "não informado"],
                      [`Vendas${r.periodo === "total" ? " · total" : " · 30 dias"}`, num(r.vendas)],
                      ["Conversão da loja", pct(r.conversao)],
                      ["Qualidade média", r.notaMedia == null ? "—" : `${r.notaMedia}/100`],
                      [`Deixando de faturar${r.periodo === "30d" ? " /mês" : ""}`, r.ganho ? formatBRL(r.ganho) : "—"],
                    ].map(([rot, val]) => (
                      <Card key={rot} className="p-3">
                        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{rot}</p>
                        <p className="mt-1 text-lg font-extrabold">{val}</p>
                      </Card>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Link href="/marketplaces/raio-x" className={buttonClass(filtro ? "ghost" : "primary", "sm")}>
                      Todos
                    </Link>
                    {(["conversao", "trafego", "parado", "campeao", "ok", "sem-dados"] as Diagnostico[])
                      .filter((d) => contagem(d))
                      .map((d) => (
                        <Link key={d} href={`/marketplaces/raio-x?filtro=${d}`} className={buttonClass(filtro === d ? "primary" : "ghost", "sm")}>
                          {DIAGNOSTICOS[d].nome} ({contagem(d)})
                        </Link>
                      ))}
                  </div>
                  <Card>
                    <CardHeader
                      title={`${daqui.length} anúncio(s)`}
                      description={
                        k === "magalu"
                          ? "O Magalu não informa visitas por API: aqui contam as vendas dos últimos 30 dias e as melhorias de anúncio."
                          : k === "shopee"
                            ? "A Shopee só informa visualizações e vendas desde a publicação; a conversão compara cada anúncio com a média da sua loja."
                            : "Visitas dos últimos 30 dias, vendas do mesmo período e as ações que o próprio Mercado Livre pede em cada anúncio."
                      }
                    />
                    <div className="divide-y divide-border">
                      {daqui.length ? daqui.map((l) => <Anuncio key={`${l.contaId}-${l.idExterno}`} l={l} voltar={voltar} />) : <p className="p-5 text-sm text-muted">Nada aqui.</p>}
                    </div>
                  </Card>
                </div>
              ),
            };
          })}
        />
      )}
    </>
  );
}
