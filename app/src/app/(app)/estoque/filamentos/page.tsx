import { asc } from "drizzle-orm";
import { Plus, Printer, Spool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { filamentos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { capacidadeProducao } from "@/lib/filamentos";
import { cn, formatBRL, formatGramas, precoGrama } from "@/lib/utils";
import { FilamentoForm } from "./filamento-form";

export const metadata: Metadata = { title: "Filamentos" };


export default async function FilamentosPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  await requireUser();
  const { novo } = await searchParams;
  const [lista, capacidade] = await Promise.all([db.select().from(filamentos).orderBy(asc(filamentos.material), asc(filamentos.cor)), capacidadeProducao()]);
  const ativos = lista.filter((f) => f.ativo);
  const totalG = ativos.reduce((s, f) => s + Math.max(0, f.saldoG), 0);
  const valor = ativos.reduce((s, f) => s + (Math.max(0, f.saldoG) / 1000) * f.custoKg, 0);
  const comprar = ativos.filter((f) => f.saldoG <= f.minimoG).length;

  return (
    <>
      <PageHeader
        title="Filamentos"
        description="Matéria-prima por material e cor. Entra pelas notas de entrada e sai pela produção; a pesagem acerta o saldo."
        actions={
          <>
            <Link href="/estoque/producao" className={buttonClass("outline")}>
              <Printer /> Registrar produção
            </Link>
            <Link href="/estoque/filamentos?novo=1" className={buttonClass("primary")}>
              <Plus /> Novo filamento
            </Link>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Em estoque</p>
          <p className="mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl">{formatGramas(totalG)}</p>
          <p className="mt-1 text-xs text-muted">{ativos.length} filamento(s) · {ativos.filter((f) => f.saldoG > 0).length} cor(es) com saldo</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Valor a custo</p>
          <p className="mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl">{formatBRL(valor)}</p>
          <p className="mt-1 text-xs text-muted">Saldo (g) × custo médio do grama</p>
        </Card>
        <Card className={cn("p-4 sm:p-5", comprar && "border-gold/50")}>
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Comprar</p>
          <p className={cn("mt-2 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl", comprar && "text-gold")}>{comprar}</p>
          <p className="mt-1 text-xs text-muted">Abaixo do alerta</p>
        </Card>
      </div>

      {novo ? (
        <div className="mb-6 max-w-3xl">
          <FilamentoForm />
        </div>
      ) : null}

      {lista.length === 0 && !novo ? (
        <Card>
          <EmptyState
            icon={<Spool />}
            title="Nenhum filamento cadastrado"
            description="Cadastre cada material e cor que você usa (com o saldo de hoje) para controlar o estoque e saber quanto ainda dá para imprimir."
            action={
              <Link href="/estoque/filamentos?novo=1" className={buttonClass("gold")}>
                <Plus /> Cadastrar filamento
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {lista.map((f) => {
            const pct = Math.min(100, (Math.max(0, f.saldoG) / Math.max(f.minimoG * 4, 1000)) * 100);
            const pecas = capacidade.filter((c) => c.filamentoId === f.id && c.pecas !== null);
            return (
              <Link key={f.id} href={`/estoque/filamentos/${f.id}`} className="group">
                <Card className={cn("h-full p-5 transition group-hover:border-gold", !f.ativo && "opacity-50")}>
                  <div className="flex items-start gap-3">
                    <span className="size-10 shrink-0 rounded-full border border-border shadow-inner" style={{ background: f.corHex }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {f.material} {f.cor}
                      </p>
                      <p className="text-xs text-muted">{f.marca || "—"}</p>
                    </div>
                    {f.saldoG <= f.minimoG ? <Badge tone={f.saldoG <= 0 ? "red" : "gold"}>{f.saldoG <= 0 ? "Acabou" : "Comprar"}</Badge> : null}
                  </div>
                  <p className={cn("mt-4 font-display text-[clamp(1rem,5.2vw,1.5rem)] font-extrabold whitespace-nowrap sm:text-2xl", f.saldoG <= 0 && "text-red")}>{formatGramas(f.saldoG)}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: f.corHex }} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {precoGrama(f.custoKg)} · custo médio
                  </p>
                  {pecas.length ? (
                    <div className="mt-3 grid gap-1 border-t border-border pt-3 text-xs">
                      <p className="font-semibold text-muted uppercase">Dá para imprimir</p>
                      {pecas.slice(0, 4).map((c) => (
                        <p key={c.id} className="flex min-w-0 justify-between gap-2">
                          <span className="min-w-0 truncate">{c.nome}</span>
                          <span className="font-semibold whitespace-nowrap">{c.pecas} un.</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
