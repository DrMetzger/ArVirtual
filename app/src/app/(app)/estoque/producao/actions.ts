"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { registrarProducao } from "@/lib/filamentos";

export type FormState = { erro?: string; ok?: string } | null;

const Schema = z.object({
  produtoId: z.uuid("Escolha o produto"),
  quantidade: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
  filamentoId: z.coerce.number().int().optional(),
  perdaG: z.coerce.number().int().min(0).default(0),
  observacao: z.string().trim().max(500).default(""),
});

export async function produzir(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(form);
  const p = Schema.safeParse({ ...raw, filamentoId: raw.filamentoId || undefined });
  if (!p.success) return { erro: p.error.issues[0]?.message };
  try {
    await registrarProducao({ ...p.data, usuarioId: user.sub });
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/estoque", "layout");
  return { ok: `Produção de ${p.data.quantidade} peça(s) registrada: entrou no estoque e o filamento foi baixado.` };
}
