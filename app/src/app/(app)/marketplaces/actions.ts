"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contasMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sincronizarPedidos } from "@/lib/marketplaces";

export async function sincronizar() {
  await requireUser();
  const r = await sincronizarPedidos(30);
  revalidatePath("/");
  const erros = r.filter((x) => x.erro);
  const total = r.reduce((s, x) => s + x.pedidos, 0);
  const q = erros.length
    ? `erro=${encodeURIComponent(erros.map((e) => `${e.conta}: ${e.erro}`).join(" | "))}`
    : `ok=${encodeURIComponent(r.length ? `${total} pedidos sincronizados de ${r.length} conta(s).` : "Nenhuma conta conectada.")}`;
  redirect(`/marketplaces?${q}`);
}

export async function desconectar(id: number) {
  await requireUser();
  await db.delete(contasMarketplace).where(eq(contasMarketplace.id, id));
  revalidatePath("/marketplaces");
}
