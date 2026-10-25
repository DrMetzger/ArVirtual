import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { contasCaixa } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NovoLancamento } from "./novo-form";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NovoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireUser();
  const tipo = (await searchParams).tipo === "receber" ? "receber" : "pagar";
  const contas = await db.select({ id: contasCaixa.id, nome: contasCaixa.nome }).from(contasCaixa).where(eq(contasCaixa.ativo, true)).orderBy(asc(contasCaixa.id));
  return (
    <>
      <PageHeader title="Novo lançamento" description="Despesas fixas (energia, internet, aluguel), taxas, pró-labore ou receitas fora dos pedidos." />
      <NovoLancamento tipo={tipo} contas={contas} />
    </>
  );
}
