import { round2 } from "./utils";

// Preço por canal de venda com as taxas de cada marketplace.
//
// Para cada canal: comissão (%) e taxa fixa (R$) por faixa de preço de venda, campanha de desconto (%) que o
// marketplace aplica sobre o preço anunciado, frete pago pelo vendedor (R$), imposto sobre a venda (%) e custo
// de embalagem (R$). O preço sugerido é o que, depois de tudo isso, deixa o lucro desejado sobre o custo.

export type Faixa = { ate: number; comissao: number; fixa: number }; // ate = Infinity na última faixa
export type CanalPreco = "mercadolivre" | "shopee" | "magalu" | "loja";
/** freteAcima: o frete pago pelo vendedor só entra quando a venda chega nesse valor (0 = sempre). */
/**
 * fixaMaxPct: a taxa fixa nunca passa desse % do preço (Shopee: abaixo de R$ 9 a taxa é metade do preço).
 * adicional: R$ por item somado à taxa fixa (Shopee CPF com mais de 450 pedidos em 90 dias: R$ 3).
 */
export type TaxasCanal = { faixas: Faixa[]; campanha: number; frete: number; freteAcima?: number; fixaMaxPct?: number; adicional?: number };
/** Taxa da categoria do produto em cada plataforma (troca a comissão e, se informada, a taxa fixa das faixas). */
export type AjusteCategoria = Partial<Record<"mercadolivre" | "shopee" | "magalu", { comissao: number; fixa?: number; categoria?: string }>>;
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

/** Premium do Mercado Livre (parcelado sem juros, mais exposição): comissão maior. Confira a da sua categoria. */
export const FAIXAS_PREMIUM_ML = "78.99:19%+6.5; *:19%";

export const FAIXAS_PADRAO: Record<Exclude<CanalPreco, "loja">, string> = {
  // Clássico: comissão média; abaixo de R$ 79 há custo fixo por unidade. Confira na central do vendedor.
  mercadolivre: "78.99:14%+6.5; *:14%",
  // Política de comissão da Shopee (18/09/2026); a comissão já inclui a taxa de transação.
  shopee: "79.99:20%+4.5; 99.99:14%+16; 199.99:14%+20; *:14%+26",
  // Contrato do Magalu: 18% na maioria das categorias + R$ 5 por item a partir de R$ 10.
  magalu: "9.99:18%; *:18%+5",
};

/** Aplica a taxa da categoria do produto: comissão da categoria em todas as faixas; taxa fixa onde a faixa cobra. */
export function comCategoria(p: ParametrosPreco, ajuste?: AjusteCategoria | null): ParametrosPreco {
  if (!ajuste) return p;
  const canais = { ...p.canais };
  for (const [canal, a] of Object.entries(ajuste) as [keyof AjusteCategoria, NonNullable<AjusteCategoria[keyof AjusteCategoria]>][]) {
    if (!a || !canais[canal]) continue;
    // Shopee cobra por faixa de preço (comissão diferente em cada faixa): ali a categoria não muda nada.
    if (canal === "shopee") continue;
    canais[canal] = {
      ...canais[canal],
      faixas: canais[canal].faixas.map((f) => ({ ...f, comissao: a.comissao, fixa: a.fixa !== undefined && f.fixa > 0 ? a.fixa : f.fixa })),
    };
  }
  return { ...p, canais };
}

/** Taxa fixa efetiva de uma faixa num preço de venda (limite em % do preço e adicional por item). */
function fixaEm(f: Faixa, t: TaxasCanal, venda: number) {
  return Math.min(f.fixa, t.fixaMaxPct ? (venda * t.fixaMaxPct) / 100 : Infinity) + (t.adicional ?? 0);
}

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
  const frete = venda >= (t.freteAcima ?? 0) ? t.frete : 0;
  const taxas = venda * (f.comissao / 100) + fixaEm(f, t, venda) + frete;
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
      // Sem frete grátis abaixo do limite: tenta primeiro sem o frete; se o preço passar do limite, inclui.
      const fixa = f.fixa + (t.adicional ?? 0);
      const semFrete = (alvo + fixa + p.embalagem) / fator;
      const venda = t.frete && semFrete < (t.freteAcima ?? 0) ? semFrete : (alvo + fixa + t.frete + p.embalagem) / fator;
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

export function precosPorCanal(custo: number, precoAtual: number, p: ParametrosPreco, precoDoCanal: Partial<Record<CanalPreco, number>> = {}): ResultadoCanal[] {
  return (Object.keys(p.canais) as CanalPreco[]).map((canal) => {
    const t = p.canais[canal];
    // Preço próprio do canal (cadastro do produto) ou, sem ele, o preço de venda.
    const preco = precoDoCanal[canal] || precoAtual;
    return {
      canal,
      sugerido: custo > 0 ? precoPara(custo * (1 + p.margem / 100), t, p) : 0,
      minimo: custo > 0 ? precoPara(custo, t, p) : 0,
      atual: preco > 0 ? liquido(preco, custo, t, p) : null,
    };
  });
}
