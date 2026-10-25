"use client";

import Link from "next/link";
import { CANAIS, MarcaIcone } from "@/components/marca";
import { Card, CardHeader } from "@/components/ui";
import { precosPorCanal, type ParametrosPreco } from "@/lib/precificacao";
import { cn, formatBRL } from "@/lib/utils";

/** Preço por canal: sugerido (lucro desejado depois de taxas, campanha, imposto e embalagem), mínimo e o resultado do preço atual. */
export function PrecosCanal({ custo, preco, parametros, usar }: { custo: number; preco: number; parametros: ParametrosPreco; usar: (v: number) => void }) {
  const linhas = precosPorCanal(custo, preco, parametros);
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
                <th className="text-right">A {formatBRL(preco)}</th>
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
                      onClick={() => usar(l.sugerido)}
                      className="font-semibold whitespace-nowrap text-gold hover:underline"
                      title="Usar como preço de venda"
                    >
                      {formatBRL(l.sugerido)}
                    </button>
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
        Clique no preço sugerido para usar. A última coluna mostra quanto sobra de lucro com o preço de venda atual.
      </p>
    </Card>
  );
}
