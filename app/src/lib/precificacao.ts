import { round2 } from "./utils";

// Preço por canal de venda com as taxas de cada marketplace.
//
// Para cada canal: comissão (%) e taxa fixa (R$) por faixa de preço de venda, campanha de desconto (%) que o
// marketplace aplica sobre o preço anunciado, frete pago pelo vendedor (R$), imposto sobre a venda (%) e custo
// de embalagem (R$). O preço sugerido é o que, depois de tudo isso, deixa o lucro desejado sobre o custo.

export type Faixa = { ate: number; comissao: number; fixa: number }; // ate = Infinity na última faixa
export type CanalPreco = "mercadolivre" | "shopee" | "magalu" | "loja";
export type TaxasCanal = { faixas: Faixa[]; campanha: number; frete: number };
export type ParametrosPreco = {
  imposto: number; // % sobre a venda (Simples Nacional)
  embalagem: number; // R$ por pedido
  margem: number; // % de lucro sobre o custo
  canais: Record<CanalPreco, TaxasCanal>;
};

/** Texto das faixas, ex.: "79.99:20%+4.5; 99.99:14%+16; *:14%+26" (limite do preço de venda : comissão + taxa fixa). */
export function lerFaixas(texto: string): Faixa[] {
  const faixas = texto
    .split(/[;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.replace(/\s/g, "").replace(/,/g, ".").match(/^(\*|\d+(?:\.\d+)?):(\d+(?:\.\d+)?)%(?:\+(\d+(?:\.\d+)?))?$/);
      if (!m) throw new Error(`Faixa inválida: "${p}". Use o formato limite:comissão%+taxa, ex.: 79.99:20%+4.5`);
      return { ate: m[1] === "*" ? Infinity : Number(m[1]), comissao: Number(m[2]), fixa: Number(m[3] ?? 0) };
    })
    .sort((a, b) => a.ate - b.ate);
  if (!faixas.length || faixas[faixas.length - 1]!.ate !== Infinity) faixas.push({ ate: Infinity, comissao: faixas.at(-1)?.comissao ?? 0, fixa: faixas.at(-1)?.fixa ?? 0 });
  return faixas;
}

export const FAIXAS_PADRAO: Record<Exclude<CanalPreco, "loja">, string> = {
  // Clássico: comissão média; abaixo de R$ 79 há custo fixo por unidade. Confira na central do vendedor.
  mercadolivre: "78.99:14%+6.5; *:14%",
  // Tabela da Shopee desde 01/10/2026.
  shopee: "79.99:20%+4.5; 99.99:14%+16; 199.99:14%+20; *:14%+26",
  magalu: "*:16%+5",
};

export type ResultadoCanal = {
  canal: CanalPreco;
  /** Preço anunciado que deixa o lucro desejado. */
  sugerido: number;
  /** Preço anunciado que só empata (lucro zero). */
  minimo: number;
  /** Com o preço informado: quanto sobra e a margem real sobre o custo. */
  atual: { recebe: number; lucro: number; margem: number; taxas: number } | null;
};

function faixaDe(faixas: Faixa[], precoVenda: number) {
  return faixas.find((f) => precoVenda <= f.ate) ?? faixas[faixas.length - 1]!;
}

/** Quanto entra no caixa e quanto sobra vendendo pelo preço anunciado `preco`. */
export function liquido(preco: number, custo: number, t: TaxasCanal, p: ParametrosPreco) {
  const venda = preco * (1 - t.campanha / 100);
  const f = faixaDe(t.faixas, venda);
  const taxas = venda * (f.comissao / 100) + f.fixa + t.frete;
  const imposto = venda * (p.imposto / 100);
  const recebe = venda - taxas - imposto - p.embalagem;
  const lucro = recebe - custo;
  return { recebe: round2(recebe), lucro: round2(lucro), margem: custo > 0 ? round2((lucro / custo) * 100) : 0, taxas: round2(taxas + imposto + p.embalagem + (preco - venda)) };
}

/** Menor preço anunciado que entrega `alvo` (R$) depois de taxas, campanha, imposto e embalagem. */
function precoPara(alvo: number, t: TaxasCanal, p: ParametrosPreco) {
  // Testa cada faixa: o preço de venda calculado precisa cair dentro dela.
  let anterior = 0;
  for (const f of t.faixas) {
    const fator = 1 - f.comissao / 100 - p.imposto / 100;
    if (fator > 0) {
      const venda = (alvo + f.fixa + t.frete + p.embalagem) / fator;
      if (venda > anterior && venda <= f.ate) return round2(venda / (1 - t.campanha / 100));
      // Caiu abaixo da faixa (a taxa fixa da faixa anterior era maior): o início desta faixa já serve.
      if (venda <= anterior && liquido((anterior + 0.01) / (1 - t.campanha / 100), 0, t, p).recebe >= alvo) {
        return round2((anterior + 0.01) / (1 - t.campanha / 100));
      }
    }
    anterior = f.ate;
  }
  return 0;
}

export function precosPorCanal(custo: number, precoAtual: number, p: ParametrosPreco): ResultadoCanal[] {
  return (Object.keys(p.canais) as CanalPreco[]).map((canal) => {
    const t = p.canais[canal];
    return {
      canal,
      sugerido: custo > 0 ? precoPara(custo * (1 + p.margem / 100), t, p) : 0,
      minimo: custo > 0 ? precoPara(custo, t, p) : 0,
      atual: precoAtual > 0 ? liquido(precoAtual, custo, t, p) : null,
    };
  });
}
