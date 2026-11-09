import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ArrowLeft, Gem, Link2, Plus, Radar } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos, sentinelaItens } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { coletarAgora, divulgarProduto, linkRapido, trabalhoEmAndamento } from "../../sentinela/actions";
import { AtualizarSozinho } from "../../sentinela/atualizar";
import { ItemCard, type ItemSentinela } from "../../sentinela/item-card";

export const metadata: Metadata = { title: "Garimpo de afiliados" };

const ORDENS = { garimpo: "Garimpo (comissão × venda ÷ concorrência)", comissao: "Maior comissão", velocidade: "Vendendo mais rápido", vendas: "Mais vendidos" } as const;
type Ordem = keyof typeof ORDENS;

/** Chave de "produto parecido": as 3 primeiras palavras relevantes do nome. */
const chave = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["kit", "com", "para", "de", "unid", "pcs"].includes(w))
    .slice(0, 3)
    .join(" ");

export default async function GarimpoPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; ordem?: string; min?: string; termo?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ordem = (sp.ordem && sp.ordem in ORDENS ? sp.ordem : "garimpo") as Ordem;
  const min = Math.max(0, Math.min(50, Number(sp.min ?? 10) || 0));
  const [itens, termos, jaTenho, trabalho] = await Promise.all([
    db
      .select()
      .from(sentinelaItens)
      .where(and(eq(sentinelaItens.fonte, "shopee"), gte(sentinelaItens.vistoEm, new Date(Date.now() - 3 * 86400_000)), sp.termo ? eq(sentinelaItens.termo, sp.termo) : undefined))
      .orderBy(desc(sentinelaItens.vendas))
      .limit(3000),
    db.selectDistinct({ termo: sentinelaItens.termo }).from(sentinelaItens).where(eq(sentinelaItens.fonte, "shopee")).orderBy(sentinelaItens.termo),
    db.select({ itemId: afiliadosProdutos.itemId }).from(afiliadosProdutos),
    trabalhoEmAndamento(),
  ]);
  const meus = new Set(jaTenho.map((x) => x.itemId));
  // Concorrência: quantas lojas diferentes vendem um produto parecido entre tudo o que as sentinelas viram.
  const lojasPorChave = new Map<string, Set<string>>();
  for (const i of itens) {
    const k = chave(i.nome);
    if (!lojasPorChave.has(k)) lojasPorChave.set(k, new Set());
    lojasPorChave.get(k)!.add(i.lojaId);
  }
  const lista = itens
    .filter((i) => i.comissao * 100 >= min && !meus.has(i.idExterno))
    .map((i) => {
      const concorrentes = lojasPorChave.get(chave(i.nome))?.size ?? 1;
      const giro = i.velocidade * 30 + Math.sqrt(i.vendas);
      const ganho = i.preco * i.comissao;
      return { ...i, concorrentes, ganho, score: (ganho * giro) / concorrentes };
    })
    .sort((a, b) =>
      ordem === "comissao" ? b.comissao - a.comissao || b.vendas - a.vendas : ordem === "velocidade" ? b.velocidade - a.velocidade : ordem === "vendas" ? b.vendas - a.vendas : b.score - a.score,
    )
    .slice(0, 60);
  const aqui = `/afiliados/garimpo?ordem=${ordem}&min=${min}${sp.termo ? `&termo=${encodeURIComponent(sp.termo)}` : ""}`;

  return (
    <>
      <AtualizarSozinho ativo={Boolean(trabalho)} />
      <Link href="/afiliados" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Afiliados
      </Link>
      <PageHeader
        title="Garimpo automático"
        description="As sentinelas leem a Shopee a cada 4 h: produtos com comissão alta, vendendo rápido e com poucas lojas disputando. Os que você já divulga não aparecem."
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
        <form className="flex flex-wrap items-end gap-3">
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
            Comissão mínima
            <Select name="min" defaultValue={String(min)}>
              {[0, 5, 8, 10, 12, 15, 20].map((v) => (
                <option key={v} value={v}>
                  {v}%
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
          <button type="submit" className={buttonClass("outline")}>
            Aplicar
          </button>
        </form>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Gem className="size-5 text-gold" /> {lista.length} achado(s)
              </span>
            }
            description="“Lojas parecidas” = quantas lojas diferentes vendem um produto com nome parecido entre tudo o que as sentinelas viram. Quanto menor, menos gente disputando."
          />
          {lista.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {lista.map((i) => (
                <ItemCard
                  key={i.id}
                  i={i as ItemSentinela}
                  acao={
                    <div className="grid gap-1.5">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <Badge tone="green">ganha {i.ganho.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/venda</Badge>
                        <Badge tone={i.concorrentes <= 2 ? "green" : i.concorrentes <= 5 ? "gold" : "red"}>{i.concorrentes} loja(s) parecida(s)</Badge>
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
            <EmptyState icon={<Gem />} title="Nada garimpado ainda" description="Clique em Garimpar agora. Em alguns minutos aparecem os produtos." />
          )}
        </Card>
      </div>
    </>
  );
}
