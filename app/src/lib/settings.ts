import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { configuracoes } from "@/db/schema";
import { decrypt, encrypt, mask } from "./crypto";
import { PARAMETROS_PADRAO, type ParametrosImpressao } from "./impressao";
import { FAIXAS_PADRAO, lerFaixas, type ParametrosPreco } from "./precificacao";

/** Todas as chaves configuráveis pela tela de Configurações › Integrações. */
export const SETTINGS = {
  "gemini.apiKey": { label: "Chave da API Gemini", secret: true, group: "IA (Google Gemini)" },
  "gemini.model": { label: "Modelo Gemini", secret: false, group: "IA (Google Gemini)", placeholder: "gemini-3.6-flash" },

  "seguranca.exigir2fa": { label: "Exigir verificação em duas etapas (código por e-mail) de todos os usuários", secret: false, group: "Segurança", options: ["nao", "sim"] },

  "fiscal.difalSimples": { label: "Calcular DIFAL no Simples (venda interestadual a consumidor)", secret: false, group: "Fiscal", options: ["nao", "sim"] },
  "fiscal.aproximadoPadrao": { label: "% aproximado de tributos (Lei 12.741) quando o NCM não tiver", secret: false, group: "Fiscal", placeholder: "0" },

  "apicpf.chave": { label: "Chave da API (X-API-KEY)", secret: true, group: "Consulta de CPF (APICPF)" },
  "apicpf.limiteDia": { label: "Limite de consultas por dia", secret: false, group: "Consulta de CPF (APICPF)", placeholder: "100" },
  "apicpf.limiteMinuto": { label: "Limite de consultas por minuto", secret: false, group: "Consulta de CPF (APICPF)", placeholder: "6" },

  "mercadolivre.clientId": { label: "App ID (client_id)", secret: false, group: "Mercado Livre" },
  "mercadolivre.clientSecret": { label: "Secret Key", secret: true, group: "Mercado Livre" },

  "shopee.partnerId": { label: "Partner ID", secret: false, group: "Shopee" },
  "shopee.partnerKey": { label: "Partner Key", secret: true, group: "Shopee" },
  "shopee.ambiente": { label: "Ambiente", secret: false, group: "Shopee", options: ["producao", "sandbox"] },

  "magalu.clientId": { label: "Client ID (do idm client create)", secret: false, group: "Magalu" },
  "magalu.clientSecret": { label: "Client Secret (do idm client create)", secret: true, group: "Magalu" },

  "impressao.custoFilamentoKg": { label: "Custo do filamento (R$/kg)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "120" },
  "impressao.potenciaW": { label: "Consumo médio da impressora (W)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "95" },
  "impressao.custoKwh": { label: "Tarifa de energia (R$/kWh)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "0.95" },
  "impressao.margem": { label: "Lucro desejado sobre o custo (%)", secret: false, group: "Precificação: geral", placeholder: "60" },
  "precificacao.imposto": { label: "Imposto sobre a venda (%) — Simples", secret: false, group: "Precificação: geral", placeholder: "6" },
  "precificacao.embalagem": { label: "Embalagem por pedido (R$)", secret: false, group: "Precificação: geral", placeholder: "0" },

  "mercadolivre.faixas": { label: "Comissão e taxa fixa por faixa de preço", secret: false, group: "Precificação: Mercado Livre", placeholder: "78.99:14%+6.5; *:14%" },
  "mercadolivre.campanha": { label: "Desconto de campanha (%)", secret: false, group: "Precificação: Mercado Livre", placeholder: "10" },
  "mercadolivre.frete": { label: "Frete pago pelo vendedor (R$)", secret: false, group: "Precificação: Mercado Livre", placeholder: "0" },
  "mercadolivre.prazo": { label: "Prazo para receber (dias após a venda)", secret: false, group: "Precificação: Mercado Livre", placeholder: "30" },
  "shopee.faixas": { label: "Comissão e taxa fixa por faixa de preço", secret: false, group: "Precificação: Shopee", placeholder: "79.99:20%+4.5; 99.99:14%+16; 199.99:14%+20; *:14%+26" },
  "shopee.campanha": { label: "Desconto de campanha (%)", secret: false, group: "Precificação: Shopee", placeholder: "10" },
  "shopee.frete": { label: "Frete pago pelo vendedor (R$)", secret: false, group: "Precificação: Shopee", placeholder: "0" },
  "shopee.prazo": { label: "Prazo para receber (dias após a venda)", secret: false, group: "Precificação: Shopee", placeholder: "15" },
  "magalu.faixas": { label: "Comissão e taxa fixa por faixa de preço", secret: false, group: "Precificação: Magalu", placeholder: "*:16%+5" },
  "magalu.campanha": { label: "Desconto de campanha (%)", secret: false, group: "Precificação: Magalu", placeholder: "10" },
  "magalu.frete": { label: "Frete pago pelo vendedor (R$)", secret: false, group: "Precificação: Magalu", placeholder: "0" },
  "magalu.prazo": { label: "Prazo para receber (dias após a venda)", secret: false, group: "Precificação: Magalu", placeholder: "30" },
  "loja.faixas": { label: "Taxas da loja própria (cartão/gateway) por faixa", secret: false, group: "Precificação: loja própria (Sincrolab)", placeholder: "*:0%" },
  "loja.frete": { label: "Frete pago pela loja (R$)", secret: false, group: "Precificação: loja própria (Sincrolab)", placeholder: "0" },
} as const satisfies Record<
  string,
  { label: string; secret: boolean; group: string; placeholder?: string; options?: readonly string[] }
>;

export type SettingKey = keyof typeof SETTINGS;

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<Record<K, string>> {
  const rows = await db.select().from(configuracoes).where(inArray(configuracoes.chave, keys));
  const out = Object.fromEntries(keys.map((k) => [k, ""])) as Record<K, string>;
  for (const r of rows) out[r.chave as K] = r.secreto ? decrypt(r.valor) : r.valor;
  return out;
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings([key]))[key];
}

/** Para exibir na tela: segredos mascarados, nunca o valor real. */
export async function getSettingsForDisplay() {
  const rows = await db.select().from(configuracoes);
  const map = new Map(rows.map((r) => [r.chave, r]));
  return (Object.keys(SETTINGS) as SettingKey[]).map((k) => {
    const def = SETTINGS[k];
    const row = map.get(k);
    const value = row ? (row.secreto ? mask(decrypt(row.valor)) : row.valor) : "";
    return {
      key: k,
      label: def.label,
      secret: def.secret,
      group: def.group,
      placeholder: "placeholder" in def ? def.placeholder : undefined,
      options: "options" in def ? [...def.options] : undefined,
      value,
      isSet: Boolean(row?.valor),
    };
  });
}

export async function setSetting(key: SettingKey, value: string) {
  const secret = SETTINGS[key].secret;
  const stored = secret ? encrypt(value) : value;
  await db
    .insert(configuracoes)
    .values({ chave: key, valor: stored, secreto: secret })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: stored, secreto: secret, atualizadoEm: new Date() } });
}

/** Parâmetros de preço por canal (Configurações › Precificação); campos vazios usam os padrões. */
export async function getParametrosPreco(): Promise<ParametrosPreco> {
  const chaves = [
    "impressao.margem", "precificacao.imposto", "precificacao.embalagem",
    "mercadolivre.faixas", "mercadolivre.campanha", "mercadolivre.frete",
    "shopee.faixas", "shopee.campanha", "shopee.frete",
    "magalu.faixas", "magalu.campanha", "magalu.frete",
    "loja.faixas", "loja.frete",
  ] as const satisfies readonly SettingKey[];
  const s = await getSettings([...chaves]);
  const num = (v: string, d: number) => {
    const n = Number(v.replace(",", "."));
    return v && Number.isFinite(n) ? n : d;
  };
  const faixas = (v: string, padrao: string) => {
    try {
      return lerFaixas(v || padrao);
    } catch {
      return lerFaixas(padrao);
    }
  };
  return {
    margem: num(s["impressao.margem"], PARAMETROS_PADRAO.margem),
    imposto: num(s["precificacao.imposto"], 6),
    embalagem: num(s["precificacao.embalagem"], 0),
    canais: {
      mercadolivre: { faixas: faixas(s["mercadolivre.faixas"], FAIXAS_PADRAO.mercadolivre), campanha: num(s["mercadolivre.campanha"], 10), frete: num(s["mercadolivre.frete"], 0) },
      shopee: { faixas: faixas(s["shopee.faixas"], FAIXAS_PADRAO.shopee), campanha: num(s["shopee.campanha"], 10), frete: num(s["shopee.frete"], 0) },
      magalu: { faixas: faixas(s["magalu.faixas"], FAIXAS_PADRAO.magalu), campanha: num(s["magalu.campanha"], 10), frete: num(s["magalu.frete"], 0) },
      loja: { faixas: faixas(s["loja.faixas"], "*:0%"), campanha: 0, frete: num(s["loja.frete"], 0) },
    },
  };
}

export async function getParametrosImpressao(): Promise<ParametrosImpressao> {
  const s = await getSettings(["impressao.custoFilamentoKg", "impressao.potenciaW", "impressao.custoKwh", "impressao.margem"]);
  const num = (v: string, d: number) => {
    const n = Number(v.replace(",", "."));
    return v && Number.isFinite(n) ? n : d;
  };
  return {
    custoFilamentoKg: num(s["impressao.custoFilamentoKg"], PARAMETROS_PADRAO.custoFilamentoKg),
    potenciaW: num(s["impressao.potenciaW"], PARAMETROS_PADRAO.potenciaW),
    custoKwh: num(s["impressao.custoKwh"], PARAMETROS_PADRAO.custoKwh),
    margem: num(s["impressao.margem"], PARAMETROS_PADRAO.margem),
  };
}
