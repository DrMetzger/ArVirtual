"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ajustarPara, movimentar } from "@/lib/estoque";

export type FormState = { erro?: string; ok?: string } | null;

const MovSchema = z.object({
  tipo: z.enum(["entrada", "saida", "ajuste"]),
  quantidade: z.coerce.number().int("Use números inteiros").min(0),
  observacao: z.string().trim().max(500),
});

/** Entrada, saída ou ajuste (contagem física) feitos na mão. */
export async function movimentarManual(produtoId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = MovSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const { tipo, quantidade, observacao } = p.data;
  try {
    if (tipo === "ajuste") {
      await ajustarPara(produtoId, quantidade, observacao, user.sub);
    } else {
      if (!quantidade) return { erro: "Informe a quantidade." };
      await db.transaction((tx) =>
        movimentar(tx, {
          produtoId,
          quantidade: tipo === "entrada" ? quantidade : -quantidade,
          tipo,
          observacao: observacao || (tipo === "entrada" ? "Entrada manual" : "Saída manual"),
          usuarioId: user.sub,
        }),
      );
    }
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${produtoId}`);
  return { ok: tipo === "ajuste" ? `Saldo ajustado para ${quantidade}.` : `${tipo === "entrada" ? "Entrada" : "Saída"} de ${quantidade} registrada.` };
}

export async function definirMinimo(produtoId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const minimo = Math.max(0, Math.round(Number(form.get("minimo")) || 0));
  await db.update(produtos).set({ estoqueMinimo: minimo }).where(eq(produtos.id, produtoId));
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${produtoId}`);
  return { ok: `Estoque mínimo: ${minimo}.` };
}
