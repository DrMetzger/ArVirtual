"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { pedidosMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sincronizarPedidos } from "@/lib/marketplaces";
import { cadastrarClienteDoPedido } from "@/lib/pedidos";

export async function sincronizarAgora(dias: number) {
  await requireUser();
  const r = await sincronizarPedidos(dias);
  revalidatePath("/pedidos");
  revalidatePath("/");
  const erros = r.filter((x) => x.erro);
  const total = r.reduce((s, x) => s + x.pedidos, 0);
  const q = erros.length
    ? `erro=${encodeURIComponent(erros.map((e) => `${e.conta}: ${e.erro}`).join(" | "))}`
    : `ok=${encodeURIComponent(r.length ? `${total} pedido(s) atualizados de ${r.length} conta(s).` : "Nenhuma conta conectada: conecte em Marketplaces.")}`;
  redirect(`/pedidos?${q}`);
}

/** Cadastra o comprador e abre a nota fiscal já preenchida com o pedido. */
export async function faturarPedido(id: number) {
  await requireUser();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) redirect("/pedidos");
  if (pedido.notaId) redirect(`/notas/${pedido.notaId}`);
  let erro = "";
  try {
    await cadastrarClienteDoPedido(pedido);
  } catch (e) {
    erro = (e as Error).message;
  }
  redirect(`/notas/nova?pedido=${id}${erro ? `&aviso=${encodeURIComponent(erro)}` : ""}`);
}
