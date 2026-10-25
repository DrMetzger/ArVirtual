"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { filamentos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { movimentarFilamento } from "@/lib/filamentos";
import { parseDecimal } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;

const FilamentoSchema = z.object({
  material: z.string().trim().min(2, "Informe o material (PLA, PETG...)"),
  cor: z.string().trim().min(2, "Informe a cor"),
  corHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  marca: z.string().trim().max(60),
  minimoG: z.coerce.number().int().min(0),
});

/** Cadastra ou edita um filamento. No cadastro, o saldo inicial entra como entrada no kardex. */
export async function salvarFilamento(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = FilamentoSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { erro: p.error.issues[0]?.message };
  try {
    if (id) {
      await db.update(filamentos).set({ ...p.data, ativo: form.get("ativo") === "on", atualizadoEm: new Date() }).where(eq(filamentos.id, id));
    } else {
      const saldo = Math.round(parseDecimal(form.get("saldoKg")) * 1000);
      const custoKg = parseDecimal(form.get("custoKg"));
      id = await db.transaction(async (tx) => {
        const [f] = await tx.insert(filamentos).values({ ...p.data, custoKg }).returning({ id: filamentos.id });
        if (saldo > 0) await movimentarFilamento(tx, { filamentoId: f!.id, gramas: saldo, tipo: "entrada", custoKg, observacao: "Saldo inicial", usuarioId: user.sub });
        return f!.id;
      });
    }
  } catch (e) {
    const msg = (e as Error).message;
    return { erro: /filamentos_material_cor_marca/.test(msg) ? "Já existe um filamento com esse material, cor e marca." : msg };
  }
  revalidatePath("/estoque/filamentos");
  redirect(`/estoque/filamentos/${id}`);
}

const MovSchema = z.object({ tipo: z.enum(["entrada", "ajuste", "consumo"]), gramas: z.coerce.number().int().min(0), observacao: z.string().trim().max(500) });

/** Entrada avulsa (com custo/kg), consumo avulso ou pesagem (ajuste para o peso real). */
export async function movimentarFilamentoManual(id: number, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = MovSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const { tipo, gramas, observacao } = p.data;
  try {
    await db.transaction(async (tx) => {
      const f = await tx.query.filamentos.findFirst({ where: eq(filamentos.id, id) });
      if (!f) throw new Error("Filamento não encontrado.");
      const delta = tipo === "ajuste" ? gramas - f.saldoG : tipo === "entrada" ? gramas : -gramas;
      if (!delta) return;
      await movimentarFilamento(tx, {
        filamentoId: id,
        gramas: delta,
        tipo,
        custoKg: tipo === "entrada" ? parseDecimal(form.get("custoKg")) : undefined,
        observacao: observacao || (tipo === "ajuste" ? "Pesagem" : tipo === "entrada" ? "Entrada avulsa" : "Consumo avulso"),
        usuarioId: user.sub,
      });
    });
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/estoque/filamentos");
  revalidatePath(`/estoque/filamentos/${id}`);
  return { ok: "Movimento registrado." };
}
