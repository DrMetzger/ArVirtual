"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ncms, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MEI_CFOP_900, MEI_CSOSN, REGRAS_PADRAO_MEI, REGRAS_PADRAO_SIMPLES, regraMeiErrada } from "@/lib/fiscal/matriz";
import { completarNcm, descricaoPendente } from "@/lib/fiscal/ncm";
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
  // MEI: a SEFAZ rejeita (337) CFOP/CSOSN fora da lista.
  if ((await db.query.empresa.findFirst())?.regime === 4) {
    const { csosn, cfopInterno: ci, cfopInterestadual: ce } = parsed.data;
    if (!MEI_CSOSN.includes(csosn)) return { erro: "MEI só pode usar CSOSN 102, 103, 300 ou 900." };
    if (csosn === "102" && (ci !== "5102" || ce !== "6102")) return { erro: "MEI com CSOSN 102 (venda) só pode usar CFOP 5102 (no estado) e 6102 (fora do estado)." };
    if (csosn === "900" && (!MEI_CFOP_900.includes(ci) || !MEI_CFOP_900.includes(ce))) {
      return { erro: `MEI com CSOSN 900 só pode usar os CFOPs ${MEI_CFOP_900.filter((c) => /^[56]/.test(c)).join(", ")}.` };
    }
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
  const mei = (await db.query.empresa.findFirst())?.regime === 4;
  await db.insert(regrasFiscais).values(mei ? REGRAS_PADRAO_MEI : REGRAS_PADRAO_SIMPLES);
  revalidatePath("/fiscal");
}

/** MEI: regras de venda passam a 5102/6102 com CSOSN 102 (o que a SEFAZ aceita para CRT 4). */
export async function corrigirRegrasMei() {
  await requireUser();
  const ids = (await db.select().from(regrasFiscais)).filter(regraMeiErrada).map((r) => r.id);
  if (ids.length) await db.update(regrasFiscais).set({ cfopInterno: "5102", cfopInterestadual: "6102", csosn: "102" }).where(inArray(regrasFiscais.id, ids));
  revalidatePath("/fiscal");
}

export async function criarNcm(form: FormData) {
  await requireUser();
  const codigo = onlyDigits(String(form.get("codigo") ?? ""));
  if (codigo.length !== 8) redirect(`/fiscal?ncmErro=${encodeURIComponent("O NCM precisa ter 8 dígitos.")}`);
  if (await db.query.ncms.findFirst({ where: eq(ncms.codigo, codigo) })) redirect(`/fiscal?ncmErro=${encodeURIComponent(`O NCM ${codigo} já está cadastrado.`)}`);
  const descricao = String(form.get("descricao") ?? "").trim();
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v ? parseDecimal(v) : null;
  };
  await db.insert(ncms).values({
    codigo,
    descricao: descricao || descricaoPendente(codigo),
    pendente: !descricao,
    fonte: descricao ? "manual" : "auto",
    aliquotaIpi: num("aliquotaIpi"),
    aliquotaAproximada: num("aliquotaAproximada"),
  });
  revalidatePath("/fiscal");
  // Sem descrição: a IA busca a descrição oficial e o IPI da TIPI.
  if (!descricao) {
    const r = await completarNcm(codigo);
    if (!r.ok) redirect(`/fiscal?ncmErro=${encodeURIComponent(`${codigo} cadastrado, mas sem descrição: ${r.motivo}`)}`);
  }
}

export async function excluirNcm(codigo: string) {
  await requireUser();
  await db.delete(ncms).where(eq(ncms.codigo, codigo));
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
