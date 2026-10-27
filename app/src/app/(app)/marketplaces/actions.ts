"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function desconectar(id: number) {
  await requireUser();
  await db.delete(contasMarketplace).where(eq(contasMarketplace.id, id));
  revalidatePath("/marketplaces");
}

/**
 * Liga um anúncio que já existe no marketplace a um produto do cadastro (produtoId null desfaz).
 * Fica no histórico de anúncios do produto: os pedidos desse anúncio passam a baixar o estoque do produto.
 */
export async function vincularAnuncio(
  contaId: number,
  anuncio: { idExterno: string; link: string; preco: number | null },
  produtoId: string | null,
): Promise<{ erro?: string }> {
  await requireUser();
  const conta = await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, contaId) });
  if (!conta) return { erro: "Conta não encontrada." };
  const produto = produtoId ? await db.query.produtos.findFirst({ where: eq(produtos.id, produtoId) }) : null;
  if (produtoId && !produto) return { erro: "Produto não encontrado." };
  await db.transaction(async (tx) => {
    await tx.delete(anuncios).where(and(eq(anuncios.contaId, contaId), eq(anuncios.idExterno, anuncio.idExterno)));
    if (produto) {
      await tx.insert(anuncios).values({
        produtoId: produto.id,
        contaId,
        marketplace: conta.marketplace,
        idExterno: anuncio.idExterno,
        link: anuncio.link,
        status: "publicado",
        preco: anuncio.preco ?? (produto.precosCanal[conta.marketplace] || produto.preco),
        mensagem: "Vinculado a anúncio existente",
      });
    }
  });
  revalidatePath("/produtos");
  return {};
}
