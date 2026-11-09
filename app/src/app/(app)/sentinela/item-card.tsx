import { ExternalLink, Flame, Printer, TrendingUp, Users } from "lucide-react";
import { MarcaIcone } from "@/components/marca";
import { Badge } from "@/components/ui";
import type { AnaliseSentinela } from "@/db/schema";
import { cn, formatBRL } from "@/lib/utils";

export type ItemSentinela = {
  id: number;
  fonte: "shopee" | "mercadolivre";
  idExterno: string;
  lojaId: string;
  termo: string;
  nome: string;
  imagem: string;
  link: string;
  loja: string;
  categoria: string;
  preco: number;
  comissao: number;
  vendas: number;
  posicao: number | null;
  vendedores: number | null;
  velocidade: number;
  analise: AnaliseSentinela | null;
};

const num = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Veredito da IA em uma linha colorida. */
export function Veredito({ a }: { a: AnaliseSentinela | null }) {
  if (!a) return <p className="text-xs text-muted">IA ainda não analisou</p>;
  if (!a.imprimivel || a.impresso3d === false || a.confianca < 50) return <p className="text-xs text-muted">Não é peça de impressão 3D</p>;
  const tom = (m: number) => (m >= 80 ? "text-green" : m >= 30 ? "text-gold" : "text-red");
  return (
    <div className="grid gap-0.5 text-xs">
      <p className={cn("inline-flex items-center gap-1 font-bold", tom(a.margem))}>
        <Printer className="size-3.5" /> Peça 3D · custo {formatBRL(a.custo)}
      </p>
      <p className="text-muted">
        {a.maiorCm ? `~${num(a.maiorCm)} cm${a.emPartes ? " (em partes)" : ""} · ` : ""}~{num(a.gramas)} g · {num(a.horas, 1)} h de impressão
      </p>
      {a.canais ? (
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1.5 text-center">
          {(
            [
              ["magalu", "Magalu"],
              ["mercadolivre", "ML"],
              ["shopee", "Shopee"],
            ] as const
          ).map(([k, nome]) => (
            <div key={k}>
              <p className="text-[10px] text-muted">{nome}</p>
              <p className={cn("font-bold", tom(a.canais![k].margem))}>{num(a.canais![k].margem)}%</p>
              <p className="text-[10px] text-muted">{formatBRL(a.canais![k].lucro)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("font-bold", tom(a.margem))}>margem {num(a.margem)}% · sobra {formatBRL(a.lucro)}</p>
      )}
      {a.ideia ? <p className="text-foreground">💡 {a.ideia}</p> : null}
      {a.risco ? <p className="text-red">⚠ {a.risco}</p> : null}
    </div>
  );
}

export function ItemCard({ i, acao, semIa, semComissao }: { i: ItemSentinela; acao?: React.ReactNode; semIa?: boolean; semComissao?: boolean }) {
  const shopee = i.fonte === "shopee";
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <a href={i.link} target="_blank" rel="noreferrer" className="relative block aspect-square bg-surface-2">
        {i.imagem ? <img src={i.imagem} alt="" loading="lazy" className="size-full object-contain" /> : null}
        <span className="absolute top-2 left-2 rounded-lg bg-surface/90 p-1">
          <MarcaIcone canal={i.fonte} className="size-5" />
        </span>
        {shopee && i.velocidade >= 1 ? (
          <Badge tone="red" className="absolute top-2 right-2 bg-red text-white">
            <Flame className="size-3" /> {num(i.velocidade, 1)}/dia
          </Badge>
        ) : !shopee && i.velocidade > 0 ? (
          <Badge tone="green" className="absolute top-2 right-2 bg-green text-white">
            <TrendingUp className="size-3" /> subindo
          </Badge>
        ) : null}
      </a>
      <div className="grid flex-1 content-start gap-1.5 p-3">
        <a href={i.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-semibold hover:text-gold">
          {i.nome} <ExternalLink className="inline size-3 text-muted" />
        </a>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-base font-extrabold">{formatBRL(i.preco)}</span>
          {shopee ? (
            <>
              <span className="text-muted">{num(i.vendas)} vendas</span>
              {i.comissao && !semComissao ? <Badge tone="gold">{num(i.comissao * 100, 1)}% comissão</Badge> : null}
            </>
          ) : (
            <>
              {i.posicao ? <Badge tone="blue">#{i.posicao} mais vendidos</Badge> : null}
              {i.vendedores != null ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Users className="size-3" /> {i.vendedores} vendedor(es)
                </span>
              ) : null}
            </>
          )}
        </div>
        <p className="truncate text-[11px] text-muted">
          {i.categoria || i.loja} · vigiando “{i.termo}”
        </p>
        {semIa ? null : <Veredito a={i.analise} />}
        {semIa ? null : (
          <a
            href={`/sentinela/concorrencia?q=${encodeURIComponent(i.nome.split(/\s+/).slice(0, 5).join(" "))}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
          >
            <Users className="size-3.5" /> Ver quem vende
          </a>
        )}
        {acao ? <div className="mt-auto pt-1">{acao}</div> : null}
      </div>
    </div>
  );
}
