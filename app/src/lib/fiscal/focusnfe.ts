import "server-only";
import type { Cliente, Empresa, Endereco } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { onlyDigits } from "@/lib/utils";
import type { ItemCalculado } from "./matriz";

// Emissão via API da Focus NFe (https://focusnfe.com.br/doc/). A Focus guarda o certificado A1
// e conversa com a SEFAZ; aqui só montamos o JSON da nota a partir da matriz fiscal.

async function config() {
  const s = await getSettings(["focusnfe.token", "focusnfe.ambiente"]);
  if (!s["focusnfe.token"]) throw new Error("Cadastre o token da Focus NFe em Configurações › Integrações.");
  const ambiente = s["focusnfe.ambiente"] === "producao" ? "producao" : "homologacao";
  const base = ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
  const auth = `Basic ${Buffer.from(`${s["focusnfe.token"]}:`).toString("base64")}`;
  return { base, auth, ambiente } as const;
}

export async function ambienteFocus() {
  const s = await getSettings(["focusnfe.ambiente"]);
  return s["focusnfe.ambiente"] === "producao" ? "producao" : "homologacao";
}

export function montarPayload(args: {
  empresa: Empresa;
  cliente: Cliente;
  endereco: Endereco;
  naturezaOperacao: string;
  interna: boolean;
  itens: ItemCalculado[];
  totalProdutos: number;
  totalNota: number;
}) {
  const { empresa, cliente, endereco, itens } = args;
  const doc = onlyDigits(cliente.documento);
  const consumidorFinal = cliente.indicadorIe !== 1;
  return {
    natureza_operacao: args.naturezaOperacao,
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: args.interna ? 1 : 2,
    consumidor_final: consumidorFinal ? 1 : 0,
    presenca_comprador: 2, // operação pela internet
    cnpj_emitente: onlyDigits(empresa.cnpj),
    inscricao_estadual_emitente: onlyDigits(empresa.inscricaoEstadual),
    nome_destinatario: cliente.nome,
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: cliente.indicadorIe,
    ...(cliente.indicadorIe === 1 ? { inscricao_estadual_destinatario: onlyDigits(cliente.inscricaoEstadual) } : {}),
    logradouro_destinatario: endereco.logradouro,
    numero_destinatario: endereco.numero || "S/N",
    complemento_destinatario: endereco.complemento || undefined,
    bairro_destinatario: endereco.bairro,
    municipio_destinatario: endereco.cidade,
    codigo_municipio_destinatario: endereco.codigoIbge || undefined,
    uf_destinatario: endereco.uf,
    cep_destinatario: onlyDigits(endereco.cep),
    pais_destinatario: "Brasil",
    telefone_destinatario: onlyDigits(cliente.telefone) || undefined,
    email_destinatario: cliente.email || undefined,
    modalidade_frete: 9,
    valor_produtos: args.totalProdutos,
    valor_total: args.totalNota,
    items: itens.map((i, idx) => ({
      numero_item: idx + 1,
      codigo_produto: i.sku,
      descricao: i.nome,
      cfop: i.cfop,
      codigo_ncm: onlyDigits(i.ncm),
      cest: i.cest ? onlyDigits(i.cest) : undefined,
      codigo_barras_comercial: i.gtin || "SEM GTIN",
      codigo_barras_tributavel: i.gtin || "SEM GTIN",
      unidade_comercial: i.unidade,
      quantidade_comercial: i.quantidade,
      valor_unitario_comercial: i.valorUnitario,
      unidade_tributavel: i.unidade,
      quantidade_tributavel: i.quantidade,
      valor_unitario_tributavel: i.valorUnitario,
      valor_bruto: i.valorBruto,
      inclui_no_total: 1,
      icms_origem: i.origem,
      icms_situacao_tributaria: i.situacaoIcms,
      ...(i.valorIcms > 0
        ? { icms_modalidade_base_calculo: 3, icms_base_calculo: i.valorBruto, icms_aliquota: i.aliqIcms, icms_valor: i.valorIcms }
        : {}),
      pis_situacao_tributaria: i.cstPis,
      ...(i.aliqPis > 0 ? { pis_base_calculo: i.valorBruto, pis_aliquota_porcentual: i.aliqPis, pis_valor: i.valorPis } : {}),
      cofins_situacao_tributaria: i.cstCofins,
      ...(i.aliqCofins > 0
        ? { cofins_base_calculo: i.valorBruto, cofins_aliquota_porcentual: i.aliqCofins, cofins_valor: i.valorCofins }
        : {}),
      ...(i.cstIpi
        ? { ipi_situacao_tributaria: i.cstIpi, ipi_base_calculo: i.valorBruto, ipi_aliquota: i.aliqIpi, ipi_valor: i.valorIpi, ipi_codigo_enquadramento_legal: "999" }
        : {}),
    })),
  };
}

export type StatusFocus = {
  status: "processando_autorizacao" | "autorizado" | "erro_autorizacao" | "cancelado" | "denegado" | string;
  numero?: string;
  serie?: string;
  chave_nfe?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem_sefaz?: string;
  mensagem?: string;
  erros?: { mensagem: string; campo?: string }[];
};

export async function emitirNfe(referencia: string, payload: ReturnType<typeof montarPayload>) {
  const c = await config();
  const res = await fetch(`${c.base}/v2/nfe?ref=${encodeURIComponent(referencia)}`, {
    method: "POST",
    headers: { Authorization: c.auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as StatusFocus;
  return { ok: res.ok, httpStatus: res.status, body, ambiente: c.ambiente, base: c.base };
}

export async function consultarNfe(referencia: string) {
  const c = await config();
  const res = await fetch(`${c.base}/v2/nfe/${encodeURIComponent(referencia)}?completa=0`, {
    headers: { Authorization: c.auth },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as StatusFocus;
  return { ok: res.ok, body, base: c.base };
}

export async function cancelarNfe(referencia: string, justificativa: string) {
  const c = await config();
  const res = await fetch(`${c.base}/v2/nfe/${encodeURIComponent(referencia)}`, {
    method: "DELETE",
    headers: { Authorization: c.auth, "Content-Type": "application/json" },
    body: JSON.stringify({ justificativa }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as StatusFocus;
  return { ok: res.ok, body };
}

export function mensagemFocus(b: StatusFocus) {
  if (b.erros?.length) return b.erros.map((e) => e.mensagem).join(" | ");
  return b.mensagem_sefaz || b.mensagem || "";
}
