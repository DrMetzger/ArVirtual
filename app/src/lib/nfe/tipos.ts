// Impostos de um item da nota, no formato do motor do ERP Vanguard (o montador do XML lê daqui).

export interface IbsCbsTaxes {
  cst: string;
  classTrib: string;
  name: string;
  withGroup: boolean;
  base: number;
  ibsUf: { rate: number; reduction: number; effective: number; value: number };
  ibsMun: { rate: number; reduction: number; effective: number; value: number };
  cbs: { rate: number; reduction: number; effective: number; value: number };
  ibs: number;
}

export interface ItemTaxes {
  icms: { cst: string; base: number; rate: number; value: number; reduction: number; snCreditRate?: number; snCredit?: number };
  st: { base: number; mva: number; rate: number; value: number; fcpRate?: number; fcpValue?: number } | null;
  ipi: { cst: string; base: number; rate: number; value: number } | null;
  fcp: { base: number; rate: number; value: number } | null;
  difal: { base: number; destRate: number; interRate: number; value: number; fcpRate: number; fcpValue: number } | null;
  pis: { cst: string; base: number; rate: number; value: number };
  cofins: { cst: string; base: number; rate: number; value: number };
  freight: number;
  discount: number;
  /** Lei 12.741/2012: valor aproximado dos tributos. */
  approx?: { rate: number; value: number };
  ibsCbs?: IbsCbsTaxes | null;
  /** Valor do item na nota: produto − desconto + frete + IPI + ST. */
  total: number;
  rules: string[];
}

// CST do IBS/CBS emitidos (reforma tributária). Este app ainda não gera o grupo; ficam para o montador validar.
export const IBSCBS_WITH_GROUP = ["000", "010", "011", "200", "222"];
export const IBSCBS_NO_GROUP = ["400", "410"];
