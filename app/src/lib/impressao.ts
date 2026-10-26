import { round2 } from "./utils";

export type ParametrosImpressao = {
  custoFilamentoKg: number;
  potenciaW: number;
  custoKwh: number;
  margem: number;
};

/** Padrões razoáveis para a Bambu Lab A1 mini com PLA; ajustáveis em Configurações. */
export const PARAMETROS_PADRAO: ParametrosImpressao = { custoFilamentoKg: 120, potenciaW: 95, custoKwh: 0.95, margem: 60 };

export function custoImpressao(filamentoG: number, tempoMin: number, p: ParametrosImpressao) {
  const material = (filamentoG / 1000) * p.custoFilamentoKg;
  const energia = (tempoMin / 60) * (p.potenciaW / 1000) * p.custoKwh;
  const custo = round2(material + energia);
  return {
    material: round2(material),
    energia: round2(energia),
    custo,
    precoSugerido: round2(custo * (1 + p.margem / 100)),
  };
}

export type Componente = { filamentoId: number | null; gramas: number; tempoMin?: number };

/**
 * Custo de uma peça com vários filamentos (multicor/AMS): cada um com as suas gramas e o custo médio do kg dele
 * (sem filamento do estoque, usa o custo padrão de Configurações).
 */
export function custoComposicao(composicao: Componente[], tempoMin: number, p: ParametrosImpressao, filamentos: { id: number; custoKg: number }[]) {
  const material = composicao.reduce((s, c) => {
    const f = filamentos.find((x) => x.id === c.filamentoId);
    return s + (c.gramas / 1000) * (f && f.custoKg > 0 ? f.custoKg : p.custoFilamentoKg);
  }, 0);
  const energia = (tempoMin / 60) * (p.potenciaW / 1000) * p.custoKwh;
  const custo = round2(material + energia);
  return { material: round2(material), energia: round2(energia), custo, precoSugerido: round2(custo * (1 + p.margem / 100)) };
}

export const gramasTotais = (composicao: Componente[]) => composicao.reduce((s, c) => s + (c.gramas || 0), 0);
