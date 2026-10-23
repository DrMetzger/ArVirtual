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
