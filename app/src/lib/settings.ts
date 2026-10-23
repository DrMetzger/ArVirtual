import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { configuracoes } from "@/db/schema";
import { decrypt, encrypt, mask } from "./crypto";
import { PARAMETROS_PADRAO, type ParametrosImpressao } from "./impressao";

/** Todas as chaves configuráveis pela tela de Configurações › Integrações. */
export const SETTINGS = {
  "gemini.apiKey": { label: "Chave da API Gemini", secret: true, group: "IA (Google Gemini)" },
  "gemini.model": { label: "Modelo Gemini", secret: false, group: "IA (Google Gemini)", placeholder: "gemini-2.5-flash" },

  "focusnfe.token": { label: "Token Focus NFe", secret: true, group: "Emissão de NF-e (Focus NFe)" },
  "focusnfe.ambiente": { label: "Ambiente", secret: false, group: "Emissão de NF-e (Focus NFe)", options: ["homologacao", "producao"] },
  "nfe.serie": { label: "Série da NF-e", secret: false, group: "Emissão de NF-e (Focus NFe)", placeholder: "1" },

  "serpro.consumerKey": { label: "Consumer Key", secret: true, group: "Consulta CPF (Serpro)" },
  "serpro.consumerSecret": { label: "Consumer Secret", secret: true, group: "Consulta CPF (Serpro)" },

  "mercadolivre.clientId": { label: "App ID (client_id)", secret: false, group: "Mercado Livre" },
  "mercadolivre.clientSecret": { label: "Secret Key", secret: true, group: "Mercado Livre" },

  "shopee.partnerId": { label: "Partner ID", secret: false, group: "Shopee" },
  "shopee.partnerKey": { label: "Partner Key", secret: true, group: "Shopee" },
  "shopee.ambiente": { label: "Ambiente", secret: false, group: "Shopee", options: ["producao", "sandbox"] },

  "magalu.clientId": { label: "Client ID", secret: false, group: "Magalu" },
  "magalu.clientSecret": { label: "Client Secret", secret: true, group: "Magalu" },

  "impressao.custoFilamentoKg": { label: "Custo do filamento (R$/kg)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "120" },
  "impressao.potenciaW": { label: "Consumo médio da impressora (W)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "95" },
  "impressao.custoKwh": { label: "Tarifa de energia (R$/kWh)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "0.95" },
  "impressao.margem": { label: "Margem desejada (%)", secret: false, group: "Impressão 3D (Bambu Lab A1 mini)", placeholder: "60" },
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
