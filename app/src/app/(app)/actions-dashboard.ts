"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { contarAnunciosPlataformas } from "@/lib/contagem-anuncios";

/** Botão "Recontar agora" do termômetro: conta os anúncios em cada plataforma. */
export async function recontarAnuncios() {
  await requireUser();
  await contarAnunciosPlataformas();
  revalidatePath("/");
}
