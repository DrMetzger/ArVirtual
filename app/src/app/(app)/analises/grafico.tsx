"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type Barra = { rotulo: string; detalhe: string; valor: number; texto: string };

/**
 * Barras verticais de uma série só (sem legenda: o título do card diz o que é). Passar o mouse/dedo mostra o valor;
 * "Ver tabela" mostra os números para quem não lê o gráfico.
 */
export function GraficoBarras({ barras, altura = 180, marcarCada = 1 }: { barras: Barra[]; altura?: number; marcarCada?: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const max = Math.max(...barras.map((b) => b.valor), 1);
  const a = ativo !== null ? barras[ativo] : null;
  return (
    <div className="grid gap-2">
      <div className="flex min-h-10 items-end justify-between gap-2">
        <div className="text-sm">
          {a ? (
            <>
              <span className="font-semibold">{a.texto}</span> <span className="text-muted">· {a.detalhe}</span>
            </>
          ) : (
            <span className="text-muted">Passe o mouse (ou toque) nas barras para ver o valor.</span>
          )}
        </div>
        <button type="button" onClick={() => setTabela((t) => !t)} className="shrink-0 text-xs font-semibold text-gold hover:underline">
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {tabela ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {barras.map((b) => (
                <tr key={b.rotulo} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 text-muted">{b.detalhe}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{b.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-1">
          {/* Linhas de grade discretas: 0, metade e máximo. */}
          <div className="relative" style={{ height: altura }} onMouseLeave={() => setAtivo(null)}>
            {[0, 0.5, 1].map((f) => (
              <span key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${f * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {barras.map((b, i) => (
                <button
                  key={b.rotulo}
                  type="button"
                  aria-label={`${b.detalhe}: ${b.texto}`}
                  onMouseEnter={() => setAtivo(i)}
                  onFocus={() => setAtivo(i)}
                  onClick={() => setAtivo(i)}
                  className="group flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    className={cn("block w-full rounded-t-[4px] transition-colors", b.valor ? "bg-primary" : "bg-transparent", ativo !== null && ativo !== i && "opacity-40")}
                    style={{ height: `${b.valor ? Math.max(2, (b.valor / max) * 100) : 0}%` }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-[2px] text-[10px] text-muted">
            {barras.map((b, i) => (
              <span key={b.rotulo} className="min-w-0 flex-1 truncate text-center">
                {i % marcarCada === 0 ? b.rotulo : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
