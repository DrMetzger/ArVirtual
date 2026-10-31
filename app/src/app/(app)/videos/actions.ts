"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { baixarNaFila } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";

const voltarCom = (caminho: string, tipo: "ok" | "erro", msg: string): never =>
  redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}${tipo}=${encodeURIComponent(msg)}`);

/** Links de vídeo num texto (um por linha, separados por espaço, mensagem copiada...). */
function linksDoTexto(texto: string) {
  const achados = texto.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(achados.map((l) => l.replace(/[),.]+$/, "")))].slice(0, 30);
}

/** Converte (baixa em MP4) um ou vários links de vídeo, em segundo plano, um por vez. */
export async function converterVideos(form: FormData) {
  await requireUser();
  const voltar = String(form.get("voltar") ?? "/videos");
  const destino = voltar.startsWith("/afiliados") ? voltar : "/videos";
  const links = linksDoTexto(String(form.get("links") ?? ""));
  if (!links.length) voltarCom(destino, "erro", "Cole o link do vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...).");
  const produtoId = Number(form.get("produtoId")) || null;
  for (const url of links) {
    const [v] = await db.insert(afiliadosVideos).values({ produtoId, urlOrigem: url, origem: "outro", status: "baixando" }).returning({ id: afiliadosVideos.id });
    baixarNaFila(v!.id, url);
  }
  revalidatePath("/videos");
  revalidatePath("/afiliados");
  voltarCom(destino, "ok", `${links.length} vídeo(s) na fila de conversão. Eles aparecem prontos para baixar em instantes.`);
}

/** Tenta baixar de novo um vídeo que deu erro. */
export async function tentarDeNovo(id: number) {
  await requireUser();
  const v = await db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, id) });
  if (!v?.urlOrigem) return;
  await db.update(afiliadosVideos).set({ status: "baixando", erro: "" }).where(eq(afiliadosVideos.id, id));
  baixarNaFila(id, v.urlOrigem);
  revalidatePath("/videos");
}
