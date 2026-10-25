import { and, eq, lt } from "drizzle-orm";
import { ArrowDownCircle, ArrowUpCircle, Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { lancamentos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fluxoDeCaixa, saldosContas } from "@/lib/financeiro";
import { cn, formatBRL, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  await requireUser();
  const ontem = new Date(Date.now() - 12 * 3600_000);
  const [contas, fluxo, abertos, vencidos] = await Promise.all([
    saldosContas(),
    fluxoDeCaixa(12),
    db.select().from(lancamentos).where(eq(lancamentos.status, "aberto")),
    db.select().from(lancamentos).where(and(eq(lancamentos.status, "aberto"), lt(lancamentos.vencimento, ontem))),
  ]);
  const soma = (tipo: string, l = abertos) => l.filter((x) => x.tipo === tipo).reduce((s, x) => s + x.valor, 0);
  const maior = Math.max(1, ...fluxo.linhas.map((l) => Math.max(l.entradas, l.saidas)));
  const projetado = fluxo.linhas.at(-1)?.saldo ?? fluxo.saldoHoje;

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Saldo das contas, o que entra e o que sai, e o caixa projetado das próximas semanas."
        actions={
          <>
            <Link href="/financeiro/novo?tipo=pagar" className={buttonClass("outline")}>
              <ArrowUpCircle /> Despesa
            </Link>
            <Link href="/financeiro/novo?tipo=receber" className={buttonClass()}>
              <Plus /> Receita
            </Link>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Saldo em caixa</p>
          <p className={cn("mt-2 font-display text-2xl font-extrabold", fluxo.saldoHoje < 0 && "text-red")}>{formatBRL(fluxo.saldoHoje)}</p>
          <p className="mt-1 text-xs text-muted">{contas.filter((c) => c.ativo).length} conta(s)</p>
        </Card>
        <Link href="/financeiro/receber">
          <Card className="p-5 hover:border-gold/60">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">A receber</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-green">{formatBRL(soma("receber"))}</p>
            <p className="mt-1 text-xs text-muted">{formatBRL(soma("receber", vencidos))} vencido</p>
          </Card>
        </Link>
        <Link href="/financeiro/pagar">
          <Card className="p-5 hover:border-gold/60">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">A pagar</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-red">{formatBRL(soma("pagar"))}</p>
            <p className="mt-1 text-xs text-muted">{formatBRL(soma("pagar", vencidos))} vencido</p>
          </Card>
        </Link>
        <Card className="p-5">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Saldo projetado (12 semanas)</p>
          <p className={cn("mt-2 font-display text-2xl font-extrabold", projetado < 0 ? "text-red" : "text-gold")}>{formatBRL(projetado)}</p>
          <p className="mt-1 text-xs text-muted">Caixa + a receber − a pagar</p>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Fluxo de caixa" description="Títulos em aberto por semana (os vencidos entram na semana atual)." />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th className="w-1/3"></th>
                  <th className="text-right">Entradas</th>
                  <th className="text-right">Saídas</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {fluxo.linhas.map((l) => (
                  <tr key={l.de.toISOString()}>
                    <td className="whitespace-nowrap text-muted">{formatDate(l.de).slice(0, 5)}</td>
                    <td>
                      <div className="grid gap-1">
                        <div className="h-1.5 rounded-full bg-green/70" style={{ width: `${(l.entradas / maior) * 100}%` }} />
                        <div className="h-1.5 rounded-full bg-red/70" style={{ width: `${(l.saidas / maior) * 100}%` }} />
                      </div>
                    </td>
                    <td className="text-right text-green">{l.entradas ? formatBRL(l.entradas) : "—"}</td>
                    <td className="text-right text-red">{l.saidas ? formatBRL(l.saidas) : "—"}</td>
                    <td className={cn("text-right font-semibold", l.saldo < 0 && "text-red")}>{formatBRL(l.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader
            title="Contas"
            action={
              <Link href="/financeiro/contas" className={buttonClass("outline", "sm")}>
                <Landmark /> Gerenciar
              </Link>
            }
          />
          <div className="grid divide-y divide-border">
            {contas.map((c) => (
              <div key={c.id} className={cn("flex items-center justify-between px-5 py-3 text-sm", !c.ativo && "opacity-50")}>
                <div>
                  <p className="font-semibold">{c.nome}</p>
                  <p className="text-xs text-muted">
                    <ArrowDownCircle className="inline size-3 text-green" /> {formatBRL(c.entradas)} · <ArrowUpCircle className="inline size-3 text-red" /> {formatBRL(c.saidas)}
                  </p>
                </div>
                <p className={cn("font-bold", c.saldo < 0 && "text-red")}>{formatBRL(c.saldo)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
