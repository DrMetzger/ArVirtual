import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PedidoForm } from "./pedido-form";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NovoPedidoPage() {
  await requireUser();
  const [listaClientes, listaProdutos] = await Promise.all([
    db.select({ id: clientes.id, nome: clientes.nome, documento: clientes.documento }).from(clientes).orderBy(asc(clientes.nome)).limit(2000),
    db
      .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, preco: produtos.preco, estoque: produtos.estoque })
      .from(produtos)
      .where(eq(produtos.ativo, true))
      .orderBy(asc(produtos.nome)),
  ]);
  return (
    <>
      <PageHeader title="Novo pedido" description="Venda da loja própria (Sincrolab): balcão, WhatsApp, Instagram, encomenda..." />
      <PedidoForm clientes={listaClientes} produtos={listaProdutos} />
    </>
  );
}
