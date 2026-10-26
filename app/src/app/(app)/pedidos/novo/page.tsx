import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PedidoForm } from "./pedido-form";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NovoPedidoPage() {
  await requireUser();
  const lista = await db
    .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, preco: produtos.preco, precosCanal: produtos.precosCanal, estoque: produtos.estoque })
    .from(produtos)
    .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false)))
    .orderBy(asc(produtos.nome));
  // Venda da loja própria: usa o preço da loja quando o produto tem um.
  const listaProdutos = lista.map(({ precosCanal, ...p }) => ({ ...p, preco: precosCanal.loja || p.preco }));
  return (
    <>
      <PageHeader title="Novo pedido" description="Venda da loja própria (Sincrolab): balcão, WhatsApp, Instagram, encomenda..." />
      <PedidoForm produtos={listaProdutos} />
    </>
  );
}
