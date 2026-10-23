import type { RegraFiscal } from "@/db/schema";
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
  /** CSOSN no Simples Nacional, CST nos demais regimes. */
  situacaoIcms: string;
  aliqIcms: number;
  valorIcms: number;
  cstPis: string;
  aliqPis: number;
  valorPis: number;
  cstCofins: string;
  aliqCofins: number;
  valorCofins: number;
  cstIpi: string;
  aliqIpi: number;
  valorIpi: number;
};

export type Contexto = {
  ufEmitente: string;
  /** CRT: 1/2/4 = Simples/MEI, 3 = Regime Normal. */
  regime: number;
  ufDestino: string;
  /** indIEDest: 1 contribuinte; 2 e 9 tratados como não contribuinte. */
  indicadorIe: number;
};

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

export function calcularItens(regras: RegraFiscal[], itens: ItemEntrada[], ctx: Contexto) {
  const interna = ctx.ufEmitente === ctx.ufDestino;
  const simples = isSimples(ctx.regime);
  const erros: string[] = [];

  const calculados: ItemCalculado[] = [];
  for (const item of itens) {
    const regra = encontrarRegra(regras, item.ncm, ctx);
    if (!regra) {
      erros.push(`Nenhuma regra fiscal atende o item "${item.nome}" (NCM ${item.ncm}, UF ${ctx.ufDestino}).`);
      continue;
    }
    const base = round2(item.quantidade * item.valorUnitario);
    const situacaoIcms = simples ? regra.csosn : regra.cstIcms;
    if (!situacaoIcms) {
      erros.push(`A regra "${regra.nome}" não tem ${simples ? "CSOSN" : "CST de ICMS"} para o regime da empresa.`);
    }
    // No Simples, o ICMS só é destacado com CSOSN 101/201/900; nos demais vai no DAS.
    const destacaIcms = !simples || ["101", "201", "900"].includes(regra.csosn);
    calculados.push({
      ...item,
      valorBruto: base,
      regraId: regra.id,
      regraNome: regra.nome,
      cfop: interna ? regra.cfopInterno : regra.cfopInterestadual,
      situacaoIcms,
      aliqIcms: destacaIcms ? regra.aliqIcms : 0,
      valorIcms: destacaIcms ? round2((base * regra.aliqIcms) / 100) : 0,
      cstPis: regra.cstPis,
      aliqPis: regra.aliqPis,
      valorPis: round2((base * regra.aliqPis) / 100),
      cstCofins: regra.cstCofins,
      aliqCofins: regra.aliqCofins,
      valorCofins: round2((base * regra.aliqCofins) / 100),
      cstIpi: regra.cstIpi,
      aliqIpi: regra.aliqIpi,
      valorIpi: round2((base * regra.aliqIpi) / 100),
    });
  }

  const totalProdutos = round2(calculados.reduce((s, i) => s + i.valorBruto, 0));
  const totalIpi = round2(calculados.reduce((s, i) => s + i.valorIpi, 0));
  const totalImpostos = round2(
    calculados.reduce((s, i) => s + i.valorIcms + i.valorPis + i.valorCofins + i.valorIpi, 0),
  );
  // IPI soma ao total da nota; ICMS/PIS/COFINS já estão "por dentro" do preço.
  const totalNota = round2(totalProdutos + totalIpi);

  return { itens: calculados, erros, interna, totalProdutos, totalImpostos, totalNota };
}

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
