"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { impressoras } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

const Schema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à impressora").max(60),
  modelo: z.string().trim().max(60),
  larguraMm: z.coerce.number().int().min(50, "Largura mínima 50 mm").max(2000),
  profundidadeMm: z.coerce.number().int().min(50, "Profundidade mínima 50 mm").max(2000),
  alturaMm: z.coerce.number().int().min(50, "Altura mínima 50 mm").max(2000),
  cores: z.coerce.number().int().min(1).max(32),
  bicoMm: z.coerce.number().min(0.1).max(2),
  materiais: z.string().trim().max(200),
  potenciaW: z.coerce.number().int().min(10).max(3000),
});

type Estado = { ok?: string; erro?: string } | null;

export async function salvarImpressora(_: Estado, form: FormData): Promise<Estado> {
  await requireAdmin();
  const dados = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v).replace(",", ".")]));
  const p = Schema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues[0]?.message ?? "Dados inválidos" };
  const id = Number(form.get("id"));
  const valores = { ...p.data, ativa: form.get("ativa") === "on", atualizadoEm: new Date() };
  if (id) await db.update(impressoras).set(valores).where(eq(impressoras.id, id));
  else await db.insert(impressoras).values(valores);
  revalidatePath("/configuracoes");
  return { ok: id ? "Impressora salva." : "Impressora adicionada." };
}

export async function excluirImpressora(id: number): Promise<Estado> {
  await requireAdmin();
  const total = (await db.select({ id: impressoras.id }).from(impressoras)).length;
  if (total <= 1) return { erro: "Mantenha ao menos uma impressora (desative em vez de excluir)." };
  await db.delete(impressoras).where(eq(impressoras.id, id));
  revalidatePath("/configuracoes");
  return { ok: "Impressora excluída." };
}
