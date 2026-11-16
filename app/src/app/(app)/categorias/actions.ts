"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categorias } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { categorizarSemCategoria } from "@/lib/categorias";

const atualizar = () => {
  revalidatePath("/categorias");
  revalidatePath("/produtos");
};

export async function criarCategoria(form: FormData) {
  await requireUser();
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  if (!nome) return;
  const [m] = await db.select({ m: sql<number>`coalesce(max(${categorias.ordem}), 0)::int` }).from(categorias);
  await db.insert(categorias).values({ nome, ordem: (m?.m ?? 0) + 1 }).onConflictDoNothing();
  atualizar();
}

export async function renomearCategoria(form: FormData) {
  await requireUser();
  const id = Number(form.get("id"));
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  if (!id || !nome) return;
  await db.update(categorias).set({ nome, atualizadoEm: new Date() }).where(eq(categorias.id, id)).catch(() => undefined);
  atualizar();
}

/** Sobe/desce a categoria trocando a ordem com a vizinha. */
export async function moverCategoria(form: FormData) {
  await requireUser();
  const id = Number(form.get("id"));
  const dir = form.get("dir") === "cima" ? -1 : 1;
  const lista = await db.select({ id: categorias.id }).from(categorias).orderBy(categorias.ordem, categorias.nome);
  const i = lista.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  await db.transaction(async (tx) => {
    for (const [k, c] of lista.entries()) await tx.update(categorias).set({ ordem: k + 1 }).where(eq(categorias.id, c.id));
  });
  atualizar();
}

export async function excluirCategoria(form: FormData) {
  await requireUser();
  const id = Number(form.get("id"));
  // Os produtos dela ficam "Sem categoria" (on delete set null).
  if (id) await db.delete(categorias).where(eq(categorias.id, id));
  atualizar();
}

export async function categorizarComIA(): Promise<{ ok?: string; erro?: string }> {
  await requireUser();
  try {
    const r = await categorizarSemCategoria();
    atualizar();
    if (!r.categorizados && !r.restantes) return { ok: "Todos os produtos já têm categoria." };
    return { ok: `${r.categorizados} produto(s) categorizados.${r.restantes ? ` ${r.restantes} ficaram sem (ajuste no cadastro do produto).` : ""}` };
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 200) };
  }
}
