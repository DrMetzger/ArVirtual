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
  if (!a.imprimivel || a.confianca < 50) return <p className="text-xs text-muted">Não é para impressão 3D</p>;
  const tom = a.margem >= 80 ? "text-green" : a.margem >= 30 ? "text-gold" : "text-red";
  return (
    <div className="grid gap-0.5 text-xs">
      <p className={cn("inline-flex items-center gap-1 font-bold", tom)}>
        <Printer className="size-3.5" /> Dá pra imprimir · margem {num(a.margem)}%
      </p>
      <p className="text-muted">
        ~{num(a.gramas)} g · {num(a.horas, 1)} h · custo {formatBRL(a.custo)} · sobra {formatBRL(a.lucro)}
      </p>
      {a.ideia ? <p className="text-foreground">💡 {a.ideia}</p> : null}
      {a.risco ? <p className="text-red">⚠ {a.risco}</p> : null}
    </div>
  );
}

export function ItemCard({ i, acao }: { i: ItemSentinela; acao?: React.ReactNode }) {
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
              {i.comissao ? <Badge tone="gold">{num(i.comissao * 100, 1)}% comissão</Badge> : null}
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
        <Veredito a={i.analise} />
        {acao ? <div className="mt-auto pt-1">{acao}</div> : null}
      </div>
    </div>
  );
}
