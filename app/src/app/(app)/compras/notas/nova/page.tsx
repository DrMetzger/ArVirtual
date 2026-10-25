import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { fornecedores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NovaEntrada } from "./nova-entrada";

export const metadata: Metadata = { title: "Nova entrada" };

export default async function NovaEntradaPage() {
  await requireUser();
  const lista = await db.select({ id: fornecedores.id, nome: fornecedores.nome }).from(fornecedores).orderBy(asc(fornecedores.nome));
  return (
    <>
      <PageHeader title="Nova nota de entrada" description="Depois de criar, classifique os itens (filamento, produto ou despesa) e lance para dar saldo." />
      <NovaEntrada fornecedores={lista} />
    </>
  );
}
