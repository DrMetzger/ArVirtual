"use server";

import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PASTA_AFILIADOS } from "@/lib/uploads";

export async function salvarVideoGaleria(id: number, voltar: string, form: FormData) {
  await requireUser();
  await db
    .update(afiliadosVideos)
    .set({ titulo: String(form.get("titulo") ?? "").trim().slice(0, 200), descricao: String(form.get("descricao") ?? "").trim().slice(0, 3000) })
    .where(eq(afiliadosVideos.id, id));
  revalidatePath("/videos/galeria");
  redirect(voltar);
}

export async function excluirVideoGaleria(id: number, voltar: string) {
  await requireUser();
  const v = await db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, id) });
  if (v) {
    await db.delete(afiliadosVideos).where(eq(afiliadosVideos.id, id));
    if (v.arquivo) await rm(`${PASTA_AFILIADOS}/${v.arquivo}`, { force: true });
  }
  revalidatePath("/videos/galeria");
  redirect(voltar);
}
