"use client";

import Link from "next/link";
import { CANAIS, MarcaIcone } from "@/components/marca";
import { Card, CardHeader, Input } from "@/components/ui";
import {
  precosPorCanal,
  type AjusteCategoria,
  type CanalPreco,
  type ParametrosPreco,
} from "@/lib/precificacao";
import { cn, formatBRL, formatValor, parseDecimal } from "@/lib/utils";

/**
 * Preço de cada plataforma. A loja própria (Sincrolab) usa o preço de venda do produto (campo "preco", também usado
 * em pedidos e notas); Mercado Livre, Shopee e Magalu têm o seu (vazio = igual ao da loja).
 * Cada linha mostra o sugerido (lucro desejado depois de taxas), o mínimo (lucro zero) e o lucro com o preço informado.
 */
export function PrecosCanal({
  custo,
  preco,
  setPreco,
  parametros,
  precosCanal,
  alterar,
  ajuste,
}: {
  custo: number;
  preco: string;
  setPreco: (v: string) => void;
  parametros: ParametrosPreco;
  precosCanal: Record<string, string>;
  alterar: (canal: CanalPreco, valor: string) => void;
  /** Taxa da categoria do produto (mostrada na linha de cada plataforma). */
  ajuste?: AjusteCategoria;
}) {
  const base = parseDecimal(preco);
  const numeros = Object.fromEntries(
    Object.entries(precosCanal).map(([k, v]) => [k, parseDecimal(v)]),
  );
  const linhas = precosPorCanal(custo, base, parametros, numeros);
  const ordem: CanalPreco[] = ["mercadolivre", "shopee", "magalu", "loja"];
  const normalizar = (v: string) =>
    v.trim() ? formatValor(parseDecimal(v)) : "";

  return (
    <Card>
      <CardHeader
        title="Preço por plataforma"
        description={
          <>
            Cada plataforma com o seu preço. O sugerido deixa{" "}
            {parametros.margem}% de lucro sobre o custo depois de comissão, taxa
            fixa, campanha, {parametros.imposto}% de imposto
            {parametros.embalagem
              ? ` e ${formatBRL(parametros.embalagem)} de embalagem`
              : ""}
            .{" "}
            <Link href="/marketplaces/taxas" className="text-gold underline">
              Ajustar taxas
            </Link>
          </>
        }
      />
      <div className="divide-y divide-border">
        {ordem.map((canal) => {
          const l = linhas.find((x) => x.canal === canal)!;
          const loja = canal === "loja";
          const valor = loja ? preco : (precosCanal[canal] ?? "");
          const usandoPadrao = !loja && !valor.trim();
          return (
            <div key={canal} className="grid gap-1.5 px-5 py-3">
              <div className="flex items-center gap-3">
                <MarcaIcone canal={canal} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {loja ? "Sincrolab (loja)" : CANAIS[canal].nome}
                </span>
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted">
                    R$
                  </span>
                  <Input
                    name={loja ? "preco" : undefined}
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) =>
                      loja
                        ? setPreco(e.target.value)
                        : alterar(canal, e.target.value)
                    }
                    onBlur={(e) =>
                      loja
                        ? setPreco(normalizar(e.target.value))
                        : alterar(canal, normalizar(e.target.value))
                    }
                    placeholder={
                      loja ? "0,00" : base ? formatValor(base) : "0,00"
                    }
                    required={loja}
                    className="h-9 pl-9 text-right font-semibold"
                    aria-label={`Preço ${loja ? "loja própria" : CANAIS[canal].nome}`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-muted">
                {custo > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        loja
                          ? setPreco(formatValor(l.sugerido))
                          : alterar(canal, formatValor(l.sugerido))
                      }
                      className="font-semibold text-gold hover:underline"
                      title="Usar o preço sugerido"
                    >
                      sugerido {formatBRL(l.sugerido)}
                    </button>
                    <span title="Preço que só empata (lucro zero)">
                      mínimo {formatBRL(l.minimo)}
                    </span>
                    {l.atual ? (
                      <span
                        className={cn(
                          "font-semibold",
                          l.atual.lucro < 0
                            ? "text-red"
                            : l.atual.margem < parametros.margem
                              ? "text-gold"
                              : "text-green",
                        )}
                      >
                        lucro {formatBRL(l.atual.lucro)} (
                        {l.atual.margem.toFixed(0)}%)
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span>Informe o custo para ver o sugerido.</span>
                )}
                {usandoPadrao ? (
                  <span className="italic">usando o preço da loja</span>
                ) : null}
              </div>
              {!loja ? (
                <TaxaAplicada
                  parametros={parametros}
                  canal={canal}
                  preco={parseDecimal(valor) || base}
                  categoria={ajuste?.[canal]?.categoria}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-muted">
        O preço de cada plataforma é o usado ao anunciar. O da loja própria vale
        para pedidos da loja e notas fiscais.
      </p>
    </Card>
  );
}

/** Comissão e taxa fixa que valem neste preço (tabela da plataforma ou da categoria do produto). */
function TaxaAplicada({
  parametros,
  canal,
  preco,
  categoria,
}: {
  parametros: ParametrosPreco;
  canal: CanalPreco;
  preco: number;
  categoria?: string;
}) {
  const t = parametros.canais[canal];
  const venda = preco * (1 - t.campanha / 100);
  const f =
    t.faixas.find((x) => venda <= x.ate) ?? t.faixas[t.faixas.length - 1];
  if (!f) return null;
  const fixa =
    Math.min(f.fixa, t.fixaMaxPct ? (venda * t.fixaMaxPct) / 100 : Infinity) +
    (t.adicional ?? 0);
  return (
    <p className="pl-9 text-[11px] text-muted">
      taxa {f.comissao.toLocaleString("pt-BR")}%
      {fixa ? ` + ${formatBRL(fixa)}` : ""}
      {t.adicional ? ` (inclui ${formatBRL(t.adicional)} do CPF)` : ""}
      {t.campanha ? ` · campanha ${t.campanha}%` : ""}
      {categoria ? ` · categoria ${categoria}` : ""}
    </p>
  );
}
