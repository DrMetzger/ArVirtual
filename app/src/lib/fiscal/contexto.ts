import "server-only";
import { db } from "@/db";
import { ncms, regrasFiscais, ufIcms } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import type { Contexto } from "./matriz";

/** Junta tudo que o cálculo de impostos precisa: empresa, ICMS por UF, NCMs, regras e parâmetros fiscais. */
export async function carregarContextoFiscal(destino: { uf: string; indicadorIe: number }) {
  const [emp, ufs, listaNcm, regras, s] = await Promise.all([
    db.query.empresa.findFirst(),
    db.select().from(ufIcms),
    db.select({ codigo: ncms.codigo, ipi: ncms.aliquotaIpi, aprox: ncms.aliquotaAproximada }).from(ncms),
    db.select().from(regrasFiscais),
    getSettings(["fiscal.difalSimples", "fiscal.aproximadoPadrao"]),
  ]);
  if (!emp?.cnpj) throw new Error("Cadastre os dados da empresa (CNPJ, IE, UF) em Configurações › Empresa.");
  const ctx: Contexto = {
    ufEmitente: emp.uf,
    regime: emp.regime,
    ufDestino: destino.uf.toUpperCase(),
    indicadorIe: destino.indicadorIe,
    ufs: new Map(ufs.map((u) => [u.uf, { interna: u.aliquotaInterna, fcp: u.aliquotaFcp }])),
    ncmIpi: new Map(listaNcm.filter((n) => n.ipi !== null).map((n) => [n.codigo, n.ipi!])),
    ncmAproximado: new Map(listaNcm.filter((n) => n.aprox !== null).map((n) => [n.codigo, n.aprox!])),
    creditoSn: emp.aliquotaCreditoSn,
    aproximadoPadrao: Number((s["fiscal.aproximadoPadrao"] || "0").replace(",", ".")) || 0,
    difalSimples: s["fiscal.difalSimples"] === "sim",
  };
  return { empresa: emp, regras, ctx };
}
