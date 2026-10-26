"use client";

import Link from "next/link";
import { CANAIS, MarcaIcone } from "@/components/marca";
import { Card, CardHeader, Input } from "@/components/ui";
import { precosPorCanal, type CanalPreco, type ParametrosPreco } from "@/lib/precificacao";
import { cn, formatBRL, formatValor, parseDecimal } from "@/lib/utils";

/**
 * Preço por canal: mínimo (lucro zero), sugerido (lucro desejado depois de taxas, campanha, imposto e embalagem)
 * e o preço de cada canal, que fica salvo no produto (vazio = usa o preço de venda).
 */
export function PrecosCanal({
  custo,
  preco,
  parametros,
  precosCanal,
  alterar,
}: {
  custo: number;
  preco: number;
  parametros: ParametrosPreco;
  precosCanal: Record<string, string>;
  alterar: (canal: CanalPreco, valor: string) => void;
}) {
  const numeros = Object.fromEntries(Object.entries(precosCanal).map(([k, v]) => [k, parseDecimal(v)]));
  const linhas = precosPorCanal(custo, preco, parametros, numeros);
  return (
    <Card>
      <CardHeader
        title="Preço por canal"
        description={
          <>
            Lucro de {parametros.margem}% sobre o custo, já descontando comissão, taxa fixa, campanha, {parametros.imposto}% de imposto
            {parametros.embalagem ? ` e ${formatBRL(parametros.embalagem)} de embalagem` : ""}.{" "}
            <Link href="/configuracoes?aba=precificacao" className="text-gold underline">
              Ajustar taxas
            </Link>
          </>
        }
      />
      {custo > 0 ? (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Canal</th>
                <th className="text-right">Mínimo</th>
                <th className="text-right">Sugerido</th>
                <th>Preço no canal</th>
                <th className="text-right">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.canal}>
                  <td>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <MarcaIcone canal={l.canal} />
                      {CANAIS[l.canal].nome}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap text-muted" title="Preço anunciado que só empata (lucro zero)">
                    {formatBRL(l.minimo)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => alterar(l.canal, formatValor(l.sugerido))}
                      className="font-semibold whitespace-nowrap text-gold hover:underline"
                      title={`Usar como preço no ${CANAIS[l.canal].nome}`}
                    >
                      {formatBRL(l.sugerido)}
                    </button>
                  </td>
                  <td className="min-w-28">
                    <Input
                      inputMode="decimal"
                      value={precosCanal[l.canal] ?? ""}
                      onChange={(e) => alterar(l.canal, e.target.value)}
                      onBlur={(e) => e.target.value.trim() && alterar(l.canal, formatValor(parseDecimal(e.target.value)))}
                      placeholder={preco ? formatValor(preco) : "—"}
                      title="Vazio = usa o preço de venda"
                      className="h-9"
                    />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {l.atual ? (
                      <span className={cn("font-semibold", l.atual.lucro < 0 ? "text-red" : l.atual.margem < parametros.margem ? "text-gold" : "text-green")}>
                        {formatBRL(l.atual.lucro)}
                        <span className="ml-1 text-xs font-normal opacity-80">({l.atual.margem.toFixed(0)}%)</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm text-muted">Informe o custo (ou o filamento e o tempo de impressão) para ver os preços.</p>
      )}
      <p className="border-t border-border px-5 py-3 text-xs text-muted">
        Clique no sugerido para usar no canal. Cada canal guarda o seu preço (vazio = preço de venda); o lucro é calculado com ele e ele é o preço usado ao
        anunciar.
      </p>
    </Card>
  );
}
