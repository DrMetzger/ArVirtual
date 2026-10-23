import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NotaForm } from "../nota-form";

export const metadata: Metadata = { title: "Nova nota fiscal" };

export default async function NovaNotaPage() {
  await requireUser();
  const [listaClientes, listaProdutos] = await Promise.all([
    db.query.clientes.findMany({
      columns: { id: true, nome: true, documento: true },
      with: { enderecos: { columns: { id: true, apelido: true, cidade: true, uf: true, principal: true } } },
      orderBy: asc(clientes.nome),
      limit: 1000,
    }),
    db
      .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, preco: produtos.preco, estoque: produtos.estoque })
      .from(produtos)
      .where(eq(produtos.ativo, true))
      .orderBy(asc(produtos.nome)),
  ]);
  return (
    <>
      <PageHeader title="Nova nota fiscal" description="Monte a nota, confira os impostos calculados pela matriz fiscal e salve como rascunho para emitir." />
      <NotaForm clientes={listaClientes} produtos={listaProdutos} />
    </>
  );
}
