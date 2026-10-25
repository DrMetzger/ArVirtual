import type { Metadata } from "next";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { saldosContas } from "@/lib/financeiro";
import { cn, formatBRL } from "@/lib/utils";
import { ContaForm } from "./conta-form";

export const metadata: Metadata = { title: "Contas" };

export default async function ContasPage() {
  await requireUser();
  const contas = await saldosContas();
  return (
    <>
      <PageHeader title="Contas" description="Caixa, bancos e carteiras (ex.: saldo no Mercado Pago). O saldo inicial é o valor no dia em que começou a usar o sistema." />
      <div className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader title="Contas cadastradas" />
          <div className="grid divide-y divide-border">
            {contas.map((c) => (
              <div key={c.id} className="grid gap-2 px-5 py-4">
                <ContaForm conta={c} />
                <p className={cn("text-sm", c.saldo < 0 ? "text-red" : "text-muted")}>
                  Saldo atual: <b>{formatBRL(c.saldo)}</b> (inicial {formatBRL(c.saldoInicial)} + recebido {formatBRL(c.entradas)} − pago {formatBRL(c.saidas)})
                </p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Nova conta" />
          <div className="p-5">
            <ContaForm />
          </div>
        </Card>
      </div>
    </>
  );
}
