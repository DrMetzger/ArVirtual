"use server";

import { unlink } from "node:fs/promises";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { conversasIa, memoriasIa, mensagensIa } from "@/db/schema";
import { PASTA_IA } from "@/lib/assistente/arquivos";
import { requireUser } from "@/lib/auth";

// atualizado_em tem $onUpdate: repete o valor atual para a conversa não subir na lista ao ser renomeada/fixada.
const manter = { atualizadoEm: sql`${conversasIa.atualizadoEm}` };

async function minha(id: string) {
  const session = await requireUser();
  return and(eq(conversasIa.id, id), eq(conversasIa.usuarioId, session.sub));
}

export async function renomearConversa(id: string, titulo: string) {
  const t = titulo.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return;
  await db.update(conversasIa).set({ titulo: t, ...manter }).where(await minha(id));
  revalidatePath("/assistente", "layout");
}

export async function fixarConversa(id: string, fixada: boolean) {
  await db.update(conversasIa).set({ fixada, ...manter }).where(await minha(id));
  revalidatePath("/assistente", "layout");
}

export async function moverConversa(id: string, pasta: string) {
  await db.update(conversasIa).set({ pasta: pasta.trim().slice(0, 40), ...manter }).where(await minha(id));
  revalidatePath("/assistente", "layout");
}

export async function excluirConversa(id: string) {
  const cond = await minha(id);
  const conversa = await db.query.conversasIa.findFirst({ where: cond });
  if (!conversa) return;
  const msgs = await db.select({ anexos: mensagensIa.anexos }).from(mensagensIa).where(eq(mensagensIa.conversaId, id));
  await db.delete(conversasIa).where(cond);
  // Apaga os arquivos da conversa do disco.
  await Promise.all(msgs.flatMap((m) => m.anexos).map((a) => unlink(`${PASTA_IA}/${a.arquivo}`).catch(() => undefined)));
  revalidatePath("/assistente", "layout");
}

/** Conversas cujo título ou conteúdo contém o termo. */
export async function buscarConversas(termo: string): Promise<string[]> {
  const session = await requireUser();
  const q = `%${termo.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  if (q.length < 4) return [];
  const porTexto = db.selectDistinct({ id: mensagensIa.conversaId }).from(mensagensIa).where(ilike(mensagensIa.texto, q));
  const linhas = await db
    .select({ id: conversasIa.id })
    .from(conversasIa)
    .where(and(eq(conversasIa.usuarioId, session.sub), or(ilike(conversasIa.titulo, q), inArray(conversasIa.id, porTexto))))
    .orderBy(desc(conversasIa.atualizadoEm))
    .limit(100);
  return linhas.map((l) => l.id);
}

// ---------- Memória ----------
export async function listarMemorias() {
  await requireUser();
  return db.select({ id: memoriasIa.id, texto: memoriasIa.texto, ativo: memoriasIa.ativo, criadoEm: memoriasIa.criadoEm }).from(memoriasIa).orderBy(desc(memoriasIa.id));
}

export async function salvarMemoria(id: number | null, texto: string) {
  await requireUser();
  const t = texto.trim().slice(0, 500);
  if (!t) return;
  if (id) await db.update(memoriasIa).set({ texto: t }).where(eq(memoriasIa.id, id));
  else await db.insert(memoriasIa).values({ texto: t });
}

export async function alternarMemoria(id: number, ativo: boolean) {
  await requireUser();
  await db.update(memoriasIa).set({ ativo }).where(eq(memoriasIa.id, id));
}

export async function excluirMemoria(id: number) {
  await requireUser();
  await db.delete(memoriasIa).where(eq(memoriasIa.id, id));
}
