import type { RegraFiscal } from "@/db/schema";
import type { ItemTaxes } from "@/lib/nfe/tipos";
import { round2 } from "@/lib/utils";

export type ItemEntrada = {
  produtoId: string;
  sku: string;
  nome: string;
  ncm: string;
  cest: string;
  origem: number;
  unidade: string;
  gtin: string;
  quantidade: number;
  valorUnitario: number;
};

export type ItemCalculado = ItemEntrada & {
  valorBruto: number;
  regraId: number;
  regraNome: string;
  cfop: string;
  /** Impostos no formato do motor do ERP Vanguard (é o que vai para o XML). */
  taxes: ItemTaxes;
};

export type Contexto = {
  ufEmitente: string;
  /** CRT: 1 Simples, 2 Simples (excesso), 3 Regime Normal, 4 MEI. */
  regime: number;
  ufDestino: string;
  /** indIEDest: 1 contribuinte; 2 isento; 9 não contribuinte. */
  indicadorIe: number;
  /** ICMS interno e FCP por UF. */
  ufs: Map<string, { interna: number; fcp: number }>;
  /** IPI e % aproximado de tributos do cadastro de NCM. */
  ncmIpi: Map<string, number>;
  ncmAproximado: Map<string, number>;
  /** % de crédito de ICMS do Simples (CSOSN 101/201). */
  creditoSn: number | null;
  /** % aproximado de tributos quando o NCM não tem (Lei 12.741). */
  aproximadoPadrao: number;
  /** DIFAL em venda interestadual a não contribuinte: regime normal sempre; Simples só se ligado. */
  difalSimples: boolean;
};

const SUL_SUDESTE = ["SP", "RJ", "MG", "PR", "SC", "RS"];
const IMPORTADO = [1, 2, 3, 8];
const CST_ST = ["10", "30", "70", "201", "202", "203"];

// MEI (CRT 4): validações da SEFAZ (rejeição 337 "CFOP inválido para emitente MEI").
export const MEI_CSOSN = ["102", "103", "300", "900"];
/** CSOSN 102 só com CFOP 5102/6102 (venda). */
export const MEI_CFOP_VENDA = ["5102", "6102"];
/** CSOSN 900: só estes CFOPs. */
export const MEI_CFOP_900 = [
  "1202", "1904", "2202", "2904", "5202", "5904", "6202", "6904", "1501", "1503", "1504", "1505", "1506", "1553", "2501", "2503", "2504",
  "2505", "2506", "2553", "5501", "5502", "5504", "5505", "5551", "5933", "6501", "6502", "6504", "6505", "6551", "6933",
];
/** Devolução/estorno com CSOSN 103, 300 ou 900. */
export const MEI_CFOP_DEVOLUCAO = ["1202", "1553", "2202", "2553", "5202", "6202"];
/** Venda (de produção, revenda, a consumidor, com ST...): 51xx, 61xx, 54xx, 64xx. */
const ehCfopVenda = (cfop: string) => /^[56][14]\d\d$/.test(cfop);

/** Regra de venda que a SEFAZ rejeitaria para MEI (CFOP diferente de 5102/6102 ou CSOSN fora da lista). */
export const regraMeiErrada = (r: Pick<RegraFiscal, "cfopInterno" | "cfopInterestadual" | "csosn">) =>
  (ehCfopVenda(r.cfopInterno) || ehCfopVenda(r.cfopInterestadual)) &&
  (r.cfopInterno !== "5102" || r.cfopInterestadual !== "6102" || !["102", "103", "300"].includes(r.csosn));

/** Alíquota interestadual: 4% importado; 7% de Sul/Sudeste para N/NE/CO e ES; 12% nos demais. */
export function aliquotaInterestadual(ufOrigem: string, ufDestino: string, origem: number) {
  if (IMPORTADO.includes(origem)) return 4;
  return SUL_SUDESTE.includes(ufOrigem) && !SUL_SUDESTE.includes(ufDestino) ? 7 : 12;
}

export function isSimples(regime: number) {
  return regime !== 3;
}

/** Quanto maior, mais específica: NCM longo > UF > tipo de destinatário. */
function especificidade(r: RegraFiscal) {
  return r.ncmPrefixo.length * 10 + (r.ufDestino ? 5 : 0) + (r.destinatario !== "qualquer" ? 3 : 0);
}

export function encontrarRegra(regras: RegraFiscal[], ncm: string, ctx: Contexto): RegraFiscal | null {
  const contribuinte = ctx.indicadorIe === 1;
  const candidatas = regras.filter(
    (r) =>
      r.ativo &&
      (!r.ncmPrefixo || ncm.startsWith(r.ncmPrefixo)) &&
      (!r.ufDestino || r.ufDestino === ctx.ufDestino) &&
      (r.destinatario === "qualquer" || (r.destinatario === "contribuinte") === contribuinte),
  );
  candidatas.sort((a, b) => b.prioridade - a.prioridade || especificidade(b) - especificidade(a));
  return candidatas[0] ?? null;
}

// Cálculo por item no estilo do motor do ERP Vanguard (taxes/tax-engine.ts), com CFOP/CST/alíquotas da matriz fiscal.
// Ainda sem ICMS-ST (MVA) e sem IBS/CBS: CST de substituição gera aviso.
// Frete cobrado do comprador e desconto da venda são rateados pelo valor dos itens (o último leva o arredondamento)
// e entram na base dos impostos: base = produto + frete − desconto.
export function calcularItens(regras: RegraFiscal[], itens: ItemEntrada[], ctx: Contexto, venda: { frete?: number; desconto?: number } = {}) {
  const valores = itens.map((i) => round2(i.quantidade * i.valorUnitario));
  const somaValores = valores.reduce((a, b) => a + b, 0);
  const ratear = (total: number) => {
    const t = round2(Math.max(0, total || 0));
    let resto = t;
    return valores.map((v, n) => {
      if (n === valores.length - 1) return round2(resto);
      const parte = somaValores ? round2((t * v) / somaValores) : 0;
      resto -= parte;
      return parte;
    });
  };
  const fretes = ratear(venda.frete ?? 0);
  const descontos = ratear(venda.desconto ?? 0);
  if (round2(venda.desconto ?? 0) > round2(somaValores)) throw new Error("O desconto não pode ser maior que o valor dos produtos.");
  const interna = ctx.ufEmitente === ctx.ufDestino;
  const simples = isSimples(ctx.regime);
  const ufOrigem = ctx.ufs.get(ctx.ufEmitente) ?? { interna: 18, fcp: 0 };
  const ufDestino = ctx.ufs.get(ctx.ufDestino) ?? { interna: 18, fcp: 0 };
  const erros: string[] = [];
  const avisos: string[] = [];

  const calculados: ItemCalculado[] = [];
  itens.forEach((item, n) => {
    const regra = encontrarRegra(regras, item.ncm, ctx);
    if (!regra) {
      erros.push(`Nenhuma regra fiscal atende o item "${item.nome}" (NCM ${item.ncm}, UF ${ctx.ufDestino}).`);
      return;
    }
    const valorProduto = valores[n]!;
    const freteItem = fretes[n]!;
    const descontoItem = descontos[n]!;
    // Base de cálculo dos impostos do item.
    const valor = round2(valorProduto + freteItem - descontoItem);
    const regras_: string[] = [regra.nome];

    // IPI (só quando a regra tem CST de IPI; alíquota da regra ou da TIPI do NCM)
    let ipi: ItemTaxes["ipi"] = null;
    if (regra.cstIpi) {
      const aliq = regra.aliqIpi || ctx.ncmIpi.get(item.ncm) || 0;
      ipi = { cst: regra.cstIpi, base: valor, rate: aliq, value: ["50", "99"].includes(regra.cstIpi) ? round2((valor * aliq) / 100) : 0 };
    }

    // ICMS próprio
    let cst = (simples ? regra.csosn : regra.cstIcms) || (simples ? "102" : "00");
    let cfop = interna ? regra.cfopInterno : regra.cfopInterestadual;

    // MEI: a SEFAZ rejeita CFOP/CSOSN fora da lista. Venda sai sempre 5102/6102 com CSOSN 102.
    if (ctx.regime === 4) {
      if (ehCfopVenda(cfop)) {
        const certo = interna ? "5102" : "6102";
        if (cfop !== certo) avisos.push(`Item ${n + 1}: CFOP ${cfop} trocado por ${certo} (MEI só vende com 5102/6102).`);
        cfop = certo;
        if (!["102", "103", "300"].includes(cst)) {
          avisos.push(`Item ${n + 1}: CSOSN ${cst} trocado por 102 (MEI em venda).`);
          cst = "102";
        }
      } else if (!MEI_CSOSN.includes(cst)) {
        erros.push(`Item ${n + 1}: MEI só pode usar CSOSN 102, 103, 300 ou 900 (a regra "${regra.nome}" usa ${cst}).`);
      } else if (cst === "102") {
        erros.push(`Item ${n + 1}: MEI com CSOSN 102 só pode usar CFOP 5102 ou 6102 (regra "${regra.nome}" usa ${cfop}).`);
      } else if (cst === "900" && !MEI_CFOP_900.includes(cfop)) {
        erros.push(`Item ${n + 1}: MEI com CSOSN 900 não pode usar o CFOP ${cfop}. Permitidos: ${MEI_CFOP_900.join(", ")}.`);
      } else if (/^[1256]2\d\d$|^[1256]553$/.test(cfop) && !MEI_CFOP_DEVOLUCAO.includes(cfop)) {
        erros.push(`Item ${n + 1}: devolução de MEI só com CFOP ${MEI_CFOP_DEVOLUCAO.join(", ")}.`);
      }
    }
    const inter = aliquotaInterestadual(ctx.ufEmitente, ctx.ufDestino, item.origem);
    const aliq = regra.aliqIcms || (interna ? ufOrigem.interna : inter);
    const tributado = simples ? cst === "900" : ["00", "10", "20", "70", "90"].includes(cst);
    const icms: ItemTaxes["icms"] = {
      cst,
      base: tributado ? valor : 0,
      rate: tributado ? aliq : 0,
      value: tributado ? round2((valor * aliq) / 100) : 0,
      reduction: 0,
    };
    if (simples && ["101", "201"].includes(cst)) {
      icms.snCreditRate = ctx.creditoSn ?? 0;
      icms.snCredit = round2((valor * (ctx.creditoSn ?? 0)) / 100);
    }
    if (CST_ST.includes(cst)) avisos.push(`Item ${n + 1}: CST/CSOSN ${cst} é de substituição tributária, que ainda não é calculada.`);

    // FCP da operação interna (ICMS tributado)
    const fcp: ItemTaxes["fcp"] =
      interna && tributado && ufOrigem.fcp > 0 ? { base: icms.base, rate: ufOrigem.fcp, value: round2((icms.base * ufOrigem.fcp) / 100) } : null;

    // DIFAL: venda interestadual a não contribuinte (EC 87/2015)
    let difal: ItemTaxes["difal"] = null;
    if (!interna && ctx.indicadorIe === 9 && ctx.regime !== 4 && (!simples || ctx.difalSimples)) {
      difal = {
        base: valor,
        destRate: ufDestino.interna,
        interRate: inter,
        value: Math.max(0, round2((valor * (ufDestino.interna - inter)) / 100)),
        fcpRate: ufDestino.fcp,
        fcpValue: round2((valor * ufDestino.fcp) / 100),
      };
    }

    // PIS e COFINS: só CST 01/02 têm base e valor (Simples/MEI recolhem no DAS)
    const pisCofins = (c: string, a: number) => {
      const trib = ["01", "02"].includes(c);
      return { cst: c, base: trib ? valor : 0, rate: trib ? a : 0, value: trib ? round2((valor * a) / 100) : 0 };
    };
    const pis = pisCofins(regra.cstPis, regra.aliqPis);
    const cofins = pisCofins(regra.cstCofins, regra.aliqCofins);

    const aproximado = ctx.ncmAproximado.get(item.ncm) ?? ctx.aproximadoPadrao;
    calculados.push({
      ...item,
      valorBruto: valorProduto,
      regraId: regra.id,
      regraNome: regra.nome,
      cfop,
      taxes: {
        icms,
        st: null,
        ipi,
        fcp,
        difal,
        pis,
        cofins,
        freight: freteItem,
        discount: descontoItem,
        approx: { rate: aproximado, value: round2((valor * aproximado) / 100) },
        ibsCbs: null,
        total: round2(valor + (ipi?.value ?? 0)),
        rules: regras_,
      },
    });
  });

  const soma = (f: (t: ItemTaxes) => number) => round2(calculados.reduce((s, i) => s + f(i.taxes), 0));
  const totalProdutos = round2(calculados.reduce((s, i) => s + i.valorBruto, 0));
  const totalImpostos = soma((t) => t.icms.value + (t.fcp?.value ?? 0) + (t.ipi?.value ?? 0) + t.pis.value + t.cofins.value + (t.difal?.value ?? 0) + (t.difal?.fcpValue ?? 0));
  // vNF = produtos + frete − desconto + IPI (ICMS, PIS e COFINS ficam "por dentro"; DIFAL é recolhido à parte)
  const totalNota = round2(totalProdutos + soma((t) => t.freight - t.discount) + soma((t) => t.ipi?.value ?? 0));

  return { itens: calculados, erros, avisos, interna, totalProdutos, totalImpostos, totalNota };
}

/** Regras iniciais para MEI: venda sempre 5102/6102 com CSOSN 102 (exigência da SEFAZ para CRT 4). */
export const REGRAS_PADRAO_MEI = [
  {
    nome: "MEI · venda",
    prioridade: 0,
    destinatario: "qualquer" as const,
    naturezaOperacao: "Venda de mercadoria",
    cfopInterno: "5102",
    cfopInterestadual: "6102",
    csosn: "102",
    cstPis: "49",
    cstCofins: "49",
  },
];

/** Regras iniciais para quem está no Simples Nacional vendendo produto fabricado (impressão 3D). */
export const REGRAS_PADRAO_SIMPLES = [
  {
    nome: "Simples · venda de produção própria",
    prioridade: 0,
    destinatario: "qualquer" as const,
    naturezaOperacao: "Venda de produção do estabelecimento",
    cfopInterno: "5101",
    cfopInterestadual: "6101",
    csosn: "102",
    cstPis: "49",
    cstCofins: "49",
  },
  {
    nome: "Simples · consumidor final fora do estado (marketplace)",
    prioridade: 0,
    destinatario: "nao_contribuinte" as const,
    naturezaOperacao: "Venda de produção do estabelecimento",
    cfopInterno: "5101",
    cfopInterestadual: "6107",
    csosn: "102",
    cstPis: "49",
    cstCofins: "49",
  },
];
