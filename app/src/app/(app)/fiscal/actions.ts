"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ncms, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { REGRAS_PADRAO_SIMPLES } from "@/lib/fiscal/matriz";
import { completarNcm } from "@/lib/fiscal/ncm";
import { onlyDigits, parseDecimal } from "@/lib/utils";

export type FormState = { erro?: string } | null;

const str = z.string().trim();
const cfop = str.regex(/^[1-7]\d{3}$/, "CFOP deve ter 4 dígitos");
const RegraSchema = z.object({
  nome: str.min(3, "Dê um nome para a regra"),
  prioridade: z.coerce.number().int().default(0),
  ncmPrefixo: str.transform(onlyDigits).default(""),
  ufDestino: str.toUpperCase().default(""),
  destinatario: z.enum(["qualquer", "contribuinte", "nao_contribuinte"]),
  naturezaOperacao: str.min(3),
  cfopInterno: cfop,
  cfopInterestadual: cfop,
  csosn: str.default(""),
  cstIcms: str.default(""),
  cstPis: str.min(2),
  cstCofins: str.min(2),
  cstIpi: str.default(""),
});

export async function salvarRegra(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = RegraSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  if (!parsed.data.csosn && !parsed.data.cstIcms) return { erro: "Informe o CSOSN (Simples) ou o CST de ICMS (Regime Normal)." };
  if (parsed.data.cfopInterno[0] !== "5" || parsed.data.cfopInterestadual[0] !== "6") {
    return { erro: "Saídas usam CFOP 5xxx dentro do estado e 6xxx para outros estados." };
  }

  const valores = {
    ...parsed.data,
    aliqIcms: parseDecimal(form.get("aliqIcms")),
    aliqPis: parseDecimal(form.get("aliqPis")),
    aliqCofins: parseDecimal(form.get("aliqCofins")),
    aliqIpi: parseDecimal(form.get("aliqIpi")),
    ativo: form.get("ativo") === "on",
  };
  const id = Number(form.get("id") ?? 0);
  if (id) await db.update(regrasFiscais).set(valores).where(eq(regrasFiscais.id, id));
  else await db.insert(regrasFiscais).values(valores);
  revalidatePath("/fiscal");
  redirect("/fiscal");
}

export async function excluirRegra(id: number) {
  await requireUser();
  await db.delete(regrasFiscais).where(eq(regrasFiscais.id, id));
  revalidatePath("/fiscal");
  redirect("/fiscal");
}

export async function criarRegrasPadrao() {
  await requireUser();
  await db.insert(regrasFiscais).values(REGRAS_PADRAO_SIMPLES);
  revalidatePath("/fiscal");
}

export async function descreverNcmIA(codigo: string) {
  await requireUser();
  const r = await completarNcm(codigo);
  revalidatePath("/fiscal");
  if (!r.ok) redirect(`/fiscal?ncmErro=${encodeURIComponent(`${codigo}: ${r.motivo}`)}`);
}

export async function salvarNcm(codigo: string, form: FormData) {
  await requireUser();
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v ? parseDecimal(v) : null;
  };
  const descricao = String(form.get("descricao") ?? "").trim();
  await db
    .update(ncms)
    .set({
      ...(descricao ? { descricao, pendente: false, fonte: "manual" as const } : {}),
      aliquotaIpi: num("aliquotaIpi"),
      aliquotaAproximada: num("aliquotaAproximada"),
    })
    .where(eq(ncms.codigo, codigo));
  revalidatePath("/fiscal");
}
