"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/utils";

export type SerieVendas = { key: string; nome: string; cor: string };
export type PontoVendas = { dia: string } & Record<string, number | string>;

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function Dica({ active, payload, label, series }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: SerieVendas[] }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="min-w-44 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold">{label}</p>
      {series.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-sm" style={{ background: s.cor }} />
              {s.nome}
            </span>
            <span className="font-medium">{formatBRL(v)}</span>
          </div>
        );
      })}
      <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
        <span>Total</span>
        <span>{formatBRL(total)}</span>
      </div>
    </div>
  );
}

export function VendasChart({ dados, series }: { dados: PontoVendas[]; series: SerieVendas[] }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <div className="h-72" role="img" aria-label="Vendas diárias por marketplace nos últimos 30 dias">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={3}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickFormatter={(v: number) => (v ? `R$${compact.format(v)}` : "0")}
            />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Dica series={series} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="v"
                fill={s.cor}
                stroke="var(--surface)"
                strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
