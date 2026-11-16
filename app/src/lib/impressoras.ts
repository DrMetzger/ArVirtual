import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { impressoras, type Impressora } from "@/db/schema";

/** Modelos conhecidos: área útil (mm) e cores com o AMS que costuma vir junto. */
export const MODELOS_IMPRESSORA: Record<string, { area: [number, number, number]; cores: number; potenciaW: number; nomeMakerWorld: string[] }> = {
  "Bambu Lab A1 mini": { area: [180, 180, 180], cores: 4, potenciaW: 95, nomeMakerWorld: ["A1 mini"] },
  "Bambu Lab A1": { area: [256, 256, 256], cores: 4, potenciaW: 110, nomeMakerWorld: ["A1"] },
  "Bambu Lab P1P": { area: [256, 256, 256], cores: 1, potenciaW: 110, nomeMakerWorld: ["P1P"] },
  "Bambu Lab P1S": { area: [256, 256, 256], cores: 4, potenciaW: 120, nomeMakerWorld: ["P1S"] },
  "Bambu Lab P2S": { area: [256, 256, 256], cores: 4, potenciaW: 120, nomeMakerWorld: ["P2S"] },
  "Bambu Lab X1C": { area: [256, 256, 256], cores: 4, potenciaW: 130, nomeMakerWorld: ["X1 Carbon", "X1"] },
  "Bambu Lab X1E": { area: [256, 256, 256], cores: 4, potenciaW: 140, nomeMakerWorld: ["X1E"] },
  "Bambu Lab H2S": { area: [340, 320, 340], cores: 4, potenciaW: 160, nomeMakerWorld: ["H2S"] },
  "Bambu Lab H2D": { area: [325, 320, 325], cores: 8, potenciaW: 180, nomeMakerWorld: ["H2D", "H2D Pro"] },
  Outra: { area: [220, 220, 250], cores: 1, potenciaW: 120, nomeMakerWorld: [] },
};

export function listaImpressoras(soAtivas = true) {
  return db
    .select()
    .from(impressoras)
    .where(soAtivas ? eq(impressoras.ativa, true) : undefined)
    .orderBy(asc(impressoras.id));
}

export type Encaixe = { impressoraId: number; nome: string; cabe: boolean | null; motivo: string };

/**
 * A peça cabe na impressora? Compara as medidas em qualquer orientação (maior com maior), as cores necessárias
 * com as que a impressora faz de uma vez e, quando o MakerWorld informa, a lista de impressoras compatíveis do perfil.
 */
export function encaixe(i: Impressora, peca: { medidasMm?: number[] | null; cores?: number; compativeis?: string[] }): Encaixe {
  const base = { impressoraId: i.id, nome: i.nome };
  const area = [i.larguraMm, i.profundidadeMm, i.alturaMm].sort((a, b) => b - a);
  if (peca.medidasMm?.length === 3) {
    const m = [...peca.medidasMm].sort((a, b) => b - a);
    if (m.some((v, k) => v > area[k]!)) {
      return { ...base, cabe: false, motivo: `Grande demais: ${peca.medidasMm.map((v) => Math.round(v)).join(" × ")} mm (cabe até ${i.larguraMm} × ${i.profundidadeMm} × ${i.alturaMm})` };
    }
  }
  const nomesMW = MODELOS_IMPRESSORA[i.modelo]?.nomeMakerWorld ?? [];
  if (peca.compativeis?.length && nomesMW.length && !nomesMW.some((n) => peca.compativeis!.includes(n))) {
    return { ...base, cabe: false, motivo: "O perfil não é compatível com esta impressora (MakerWorld)" };
  }
  if ((peca.cores ?? 1) > i.cores) {
    return { ...base, cabe: false, motivo: `Precisa de ${peca.cores} cores ao mesmo tempo; esta faz ${i.cores}` };
  }
  if (!peca.medidasMm && !peca.compativeis?.length) return { ...base, cabe: null, motivo: "Sem as medidas: confira no fatiador" };
  return { ...base, cabe: true, motivo: peca.medidasMm ? `Cabe (${peca.medidasMm.map((v) => Math.round(v)).join(" × ")} mm)` : "Compatível (MakerWorld)" };
}

/** Maior peça (cm) que alguma impressora ativa faz: usada pela pesquisa de mercado. */
export async function maiorMedidaCm() {
  const lista = await listaImpressoras();
  return lista.length ? Math.max(...lista.map((i) => Math.max(i.larguraMm, i.profundidadeMm, i.alturaMm))) / 10 : 18;
}
