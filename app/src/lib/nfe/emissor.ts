import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, empresa, enderecos, eventosNfe, notas, type Nota } from "@/db/schema";
import { calcularNota } from "@/lib/fiscal/calculo";
import { carregarCertificado } from "@/lib/fiscal/certificado";
import type { ItemCalculado } from "@/lib/fiscal/matriz";
import { formatBRL, round2 } from "@/lib/utils";
import { gerarDanfe } from "./danfe";
import {
  AuditTransport,
  authorize,
  autorizadorOf,
  cancelEvent,
  consultKey,
  correctionEvent,
  hasUrls,
  hintFor,
  nfeProc,
  serviceStatus,
  signXml,
  summarize,
  validateXsd,
  type AuthResult,
  type Environment,
} from "./sefaz";
import { buildNfeXml, brasiliaDateTime, onlyDigits, randomCNF, UF_CODE, type NfeInput } from "./xml";

// Emissão da NF-e modelo 55 direto na SEFAZ, no mesmo fluxo do ERP Vanguard (api/src/nfe/nfe.service.ts):
// monta, assina, valida no XSD, transmite e grava cada ida à SEFAZ em eventos_nfe.

const AUTORIZADA = ["100", "150"];
const DENEGADA = ["110", "301", "302", "303"];
const CANCELADA = ["101", "151", "155"];

export const FORMAS_PAGAMENTO = [
  ["99", "Outros (marketplace)"],
  ["17", "PIX"],
  ["03", "Cartão de crédito"],
  ["04", "Cartão de débito"],
  ["15", "Boleto"],
  ["01", "Dinheiro"],
  ["90", "Sem pagamento"],
] as const;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function registrarEventos(
  tx: Tx,
  e: {
    notaId: string | null;
    tipo: string;
    ambiente: Environment;
    transport: AuditTransport;
    resultado?: Partial<AuthResult>;
    sucesso: boolean;
    erro?: string;
    sequencia?: number;
  },
) {
  // Uma linha por ida à SEFAZ; o resultado final (código, mensagem, protocolo) fica na última.
  const chamadas = e.transport.calls.length ? e.transport.calls : [null];
  for (const [i, c] of chamadas.entries()) {
    const ultima = i === chamadas.length - 1;
    const proprio = summarize(c?.response ?? null);
    await tx.insert(eventosNfe).values({
      notaId: e.notaId,
      tipo: ["nfeConsultaNF", "nfeRetAutorizacaoLote"].includes(c?.service ?? "") ? "consulta" : e.tipo,
      ambiente: e.ambiente,
      servico: c?.service ?? "",
      url: c?.url ?? "",
      requisicao: c?.request ?? null,
      resposta: c?.response ?? null,
      codigo: ultima ? (e.resultado?.cStat ?? proprio.cStat) : proprio.cStat,
      mensagem: (ultima ? (e.erro ?? e.resultado?.xMotivo ?? proprio.xMotivo) : (c?.error ?? proprio.xMotivo)) ?? "",
      protocolo: ultima ? (e.resultado?.nProt ?? null) : null,
      sucesso: ultima ? e.sucesso : false,
      sequencia: e.sequencia ?? null,
      criadoEm: sql`clock_timestamp()`,
    });
  }
}

/** Dados da nota no formato do montador do XML. Confere o cadastro antes (evita rejeição por dado faltando). */
async function montarEntrada(tx: Tx, nota: Nota, itens: ItemCalculado[], ambiente: Environment, cNF: string, emitidaEm: Date): Promise<NfeInput> {
  const emp = (await tx.query.empresa.findFirst())!;
  const cli = await tx.query.clientes.findFirst({ where: eq(clientes.id, nota.clienteId) });
  const end = nota.enderecoId ? await tx.query.enderecos.findFirst({ where: eq(enderecos.id, nota.enderecoId) }) : null;
  const faltando: string[] = [];
  const exige = (ok: unknown, oque: string) => !ok && faltando.push(oque);
  exige(onlyDigits(emp.cnpj).length === 14, "CNPJ da empresa");
  exige(emp.inscricaoEstadual, "IE da empresa");
  exige(emp.logradouro, "endereço da empresa");
  exige(emp.bairro, "bairro da empresa");
  exige(/^\d{7}$/.test(emp.codigoIbge), "código IBGE do município da empresa");
  exige(onlyDigits(emp.cep).length === 8, "CEP da empresa");
  exige(UF_CODE[emp.uf], "UF da empresa");
  exige(cli && [11, 14].includes(onlyDigits(cli.documento).length), "CPF/CNPJ do cliente");
  exige(end, "endereço de entrega da nota");
  exige(end?.bairro, "bairro do cliente");
  exige(/^\d{7}$/.test(end?.codigoIbge ?? ""), "código IBGE do município do cliente");
  exige(onlyDigits(end?.cep).length === 8, "CEP do cliente");
  if (faltando.length) throw new Error(`Faltam dados para a NF-e: ${faltando.join(", ")}.`);

  const crt = String(emp.regime) as "1" | "2" | "3" | "4";
  const info: string[] = [];
  if (crt === "1" || crt === "4") info.push("DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI.");
  const credito = round2(itens.reduce((s, i) => s + (i.taxes.icms.snCredit ?? 0), 0));
  if (credito > 0) {
    info.push(
      `PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE ${formatBRL(credito)}, CORRESPONDENTE A ALIQUOTA DE ${emp.aliquotaCreditoSn ?? 0}%, NOS TERMOS DO ART. 23 DA LC 123/2006.`,
    );
  }
  const aproximado = round2(itens.reduce((s, i) => s + (i.taxes.approx?.value ?? 0), 0));
  if (aproximado > 0) info.push(`Valor aproximado dos tributos: ${formatBRL(aproximado)} (Lei 12.741/2012).`);

  return {
    environment: ambiente,
    number: nota.numero!,
    series: nota.serie!,
    cNF,
    issuedAt: emitidaEm,
    natOp: nota.naturezaOperacao,
    finNFe: "1",
    indPres: "2", // não presencial, pela internet
    emit: {
      cnpj: emp.cnpj,
      name: emp.razaoSocial,
      tradeName: emp.nomeFantasia,
      ie: emp.inscricaoEstadual,
      crt,
      street: emp.logradouro,
      number: emp.numero,
      complement: emp.complemento,
      district: emp.bairro,
      cityCode: emp.codigoIbge,
      city: emp.cidade,
      uf: emp.uf,
      zip: emp.cep,
      phone: emp.telefone,
    },
    dest: {
      document: cli!.documento,
      name: cli!.nome,
      ie: cli!.inscricaoEstadual,
      taxpayer: String(cli!.indicadorIe),
      email: cli!.email,
      street: end!.logradouro,
      number: end!.numero,
      complement: end!.complemento,
      district: end!.bairro,
      cityCode: end!.codigoIbge,
      city: end!.cidade,
      uf: end!.uf.toUpperCase(),
      zip: end!.cep,
      phone: cli!.telefone,
    },
    items: itens.map((i) => ({
      code: i.sku,
      barcode: i.gtin,
      name: i.nome,
      ncm: i.ncm,
      cest: i.cest,
      cfop: i.cfop,
      unit: i.unidade,
      origin: i.origem,
      quantity: i.quantidade,
      unitPrice: i.valorUnitario,
      gross: i.valorBruto,
      itemDiscount: 0,
      taxes: i.taxes,
    })),
    freight: 0,
    duplicates: [],
    payment:
      nota.formaPagamento === "90"
        ? null
        : { tPag: nota.formaPagamento, indPag: "0", xPag: nota.formaPagamento === "99" ? "Venda pela internet" : undefined },
    additionalInfo: info.join(" "),
    respTec: null,
  };
}

/** Grava o resultado da autorização/consulta na nota. */
async function aplicarResultado(tx: Tx, nota: Nota, assinado: string, r: AuthResult) {
  const mensagem = [r.xMotivo, hintFor(r.cStat)].filter(Boolean).join(" — ");
  if (AUTORIZADA.includes(r.cStat) || DENEGADA.includes(r.cStat)) {
    await tx
      .update(notas)
      .set({
        status: AUTORIZADA.includes(r.cStat) ? "autorizada" : "denegada",
        codigoSefaz: r.cStat,
        mensagem,
        protocolo: r.nProt ?? null,
        autorizadaEm: r.dhRecbto ? new Date(r.dhRecbto) : new Date(),
        xmlProc: r.protNFe ? nfeProc(assinado, r.protNFe) : null,
      })
      .where(eq(notas.id, nota.id));
  } else if (CANCELADA.includes(r.cStat)) {
    await tx.update(notas).set({ status: "cancelada", codigoSefaz: r.cStat, mensagem }).where(eq(notas.id, nota.id));
  } else if (["103", "105"].includes(r.cStat)) {
    await tx
      .update(notas)
      .set({ status: "erro", codigoSefaz: r.cStat, mensagem: `${r.xMotivo}. Transmita de novo em instantes para consultar o resultado.` })
      .where(eq(notas.id, nota.id));
  } else {
    await tx.update(notas).set({ status: "rejeitada", codigoSefaz: r.cStat, mensagem }).where(eq(notas.id, nota.id));
  }
}

/** Monta, assina, valida e transmite. Com erro pendente, consulta a chave antes (nunca emite duas vezes). */
export async function transmitirNota(id: string) {
  const cert = await carregarCertificado();
  return db.transaction(async (tx) => {
    const [nota] = await tx.select().from(notas).where(eq(notas.id, id)).for("update");
    if (!nota) throw new Error("Nota não encontrada.");
    if (["autorizada", "cancelada", "denegada"].includes(nota.status)) throw new Error(`NF-e já ${nota.status}.`);
    const emp = (await tx.query.empresa.findFirst())!;
    if (!hasUrls(emp.uf)) throw new Error(`Sem endereço da SEFAZ para a UF ${emp.uf} (autorizador ${autorizadorOf(emp.uf) ?? "?"}).`);
    const transport = new AuditTransport();
    let ambiente: Environment = nota.ambiente;
    let assinado = nota.xml ?? "";
    let chave = nota.chave ?? "";

    if (nota.status === "erro" && assinado && chave) {
      // A tentativa anterior falhou no meio: pergunta à SEFAZ se a chave já existe.
      let consulta: AuthResult;
      try {
        consulta = await consultKey(transport, cert, ambiente, chave);
      } catch (e) {
        const msg = `Sem resposta da SEFAZ na consulta da chave: ${(e as Error).message}. Tente de novo em instantes.`;
        await registrarEventos(tx, { notaId: id, tipo: "consulta", ambiente, transport, sucesso: false, erro: msg });
        await tx.update(notas).set({ mensagem: msg }).where(eq(notas.id, id));
        return;
      }
      if (consulta.cStat !== "217") {
        await registrarEventos(tx, { notaId: id, tipo: "consulta", ambiente, transport, resultado: consulta, sucesso: AUTORIZADA.includes(consulta.cStat) });
        await aplicarResultado(tx, nota, assinado, consulta);
        return;
      }
      // 217 = não consta na base: reenvia o mesmo XML (mesma chave).
      await registrarEventos(tx, { notaId: id, tipo: "consulta", ambiente, transport, resultado: consulta, sucesso: true });
      transport.calls = [];
    } else {
      // Recalcula com o cadastro atual (cliente, endereço, produtos, matriz) antes de montar.
      const calc = await calcularNota({
        clienteId: nota.clienteId,
        enderecoId: nota.enderecoId ?? "",
        itens: (nota.itens as ItemCalculado[]).map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
      });
      if (calc.erros.length) throw new Error(calc.erros.join(" "));

      // Numeração: o número da nota é reservado na primeira montagem e nunca muda.
      let { numero, serie } = nota;
      if (!numero || !serie) {
        const [n] = await tx
          .update(empresa)
          .set({ proximoNumeroNfe: sql`${empresa.proximoNumeroNfe} + 1` })
          .where(eq(empresa.id, 1))
          .returning({ numero: sql<number>`${empresa.proximoNumeroNfe} - 1`, serie: empresa.serieNfe });
        numero = n!.numero;
        serie = n!.serie;
      }
      ambiente = emp.ambienteNfe;
      const emitidaEm = new Date();
      const mesmoMes = chave && chave.slice(2, 6) === brasiliaDateTime(emitidaEm).slice(2, 7).replace("-", "");
      const cNF = mesmoMes ? chave.slice(35, 43) : randomCNF(numero);
      const atual = { ...nota, numero, serie, ambiente };
      const montado = buildNfeXml(await montarEntrada(tx, atual, calc.itens, ambiente, cNF, emitidaEm));
      assinado = signXml(montado.xml, cert);
      const xsd = validateXsd(assinado);
      if (!xsd.valid) throw new Error(`XML fora do padrão (XSD): ${xsd.errors.slice(0, 3).join("; ")}`);
      chave = montado.accessKey;
      await tx
        .update(notas)
        .set({
          numero,
          serie,
          ambiente,
          chave,
          xml: assinado,
          xmlProc: null,
          emitidaEm,
          itens: calc.itens,
          totalProdutos: calc.totalProdutos,
          totalImpostos: calc.totalImpostos,
          totalNota: montado.totals.vNF,
        })
        .where(eq(notas.id, id));
    }

    let r: AuthResult;
    try {
      r = await authorize(transport, cert, emp.uf, ambiente, assinado, String(Date.now()).slice(-15));
      if (r.cStat === "204") {
        // Duplicidade: a SEFAZ já tem esta chave; busca o protocolo.
        const c = await consultKey(transport, cert, ambiente, chave);
        if (AUTORIZADA.includes(c.cStat)) r = c;
      }
    } catch (e) {
      const msg = `Falha na comunicação com a SEFAZ: ${(e as Error).message}. A nota pode ter sido recebida; transmita de novo para consultar pela chave antes de reenviar.`;
      await registrarEventos(tx, { notaId: id, tipo: "transmissao", ambiente, transport, sucesso: false, erro: msg });
      await tx.update(notas).set({ status: "erro", codigoSefaz: null, mensagem: msg }).where(eq(notas.id, id));
      return;
    }
    await registrarEventos(tx, { notaId: id, tipo: "transmissao", ambiente, transport, resultado: r, sucesso: AUTORIZADA.includes(r.cStat) });
    await aplicarResultado(tx, { ...nota, chave }, assinado, r);
  });
}

/** Cancelamento (evento 110111): só NF-e autorizada. */
export async function cancelarNota(id: string, justificativa: string) {
  const cert = await carregarCertificado();
  return db.transaction(async (tx) => {
    const [nota] = await tx.select().from(notas).where(eq(notas.id, id)).for("update");
    if (nota?.status !== "autorizada" || !nota.protocolo || !nota.chave) throw new Error("Só NF-e autorizada pode ser cancelada.");
    const emp = (await tx.query.empresa.findFirst())!;
    const transport = new AuditTransport();
    let r;
    try {
      r = await cancelEvent(transport, cert, nota.ambiente, { key: nota.chave, cnpj: onlyDigits(emp.cnpj), protocol: nota.protocolo, reason: justificativa });
    } catch (e) {
      const msg = `Falha na comunicação com a SEFAZ: ${(e as Error).message}. Tente de novo.`;
      await registrarEventos(tx, { notaId: id, tipo: "cancelamento", ambiente: nota.ambiente, transport, sucesso: false, erro: msg });
      return { ok: false, mensagem: msg };
    }
    await registrarEventos(tx, { notaId: id, tipo: "cancelamento", ambiente: nota.ambiente, transport, resultado: r, sucesso: r.ok, sequencia: 1 });
    if (!r.ok) return { ok: false, mensagem: [r.xMotivo, hintFor(r.cStat)].filter(Boolean).join(" — ") };
    await tx.update(notas).set({ status: "cancelada", codigoSefaz: r.cStat, mensagem: r.xMotivo }).where(eq(notas.id, id));
    return { ok: true, mensagem: r.xMotivo };
  });
}

/** Carta de correção (evento 110110): sequência 1 a 20; a última substitui as anteriores. */
export async function cartaCorrecao(id: string, texto: string) {
  const cert = await carregarCertificado();
  return db.transaction(async (tx) => {
    const [nota] = await tx.select().from(notas).where(eq(notas.id, id)).for("update");
    if (nota?.status !== "autorizada" || !nota.chave) throw new Error("Carta de correção só para NF-e autorizada.");
    const [feitas] = await tx
      .select({ n: count() })
      .from(eventosNfe)
      .where(sql`${eventosNfe.notaId} = ${id} AND ${eventosNfe.tipo} = 'cce' AND ${eventosNfe.sucesso}`);
    const sequencia = (feitas?.n ?? 0) + 1;
    if (sequencia > 20) throw new Error("Limite de 20 cartas de correção por NF-e.");
    const emp = (await tx.query.empresa.findFirst())!;
    const transport = new AuditTransport();
    let r;
    try {
      r = await correctionEvent(transport, cert, nota.ambiente, { key: nota.chave, cnpj: onlyDigits(emp.cnpj), text: texto, sequence: sequencia });
    } catch (e) {
      const msg = `Falha na comunicação com a SEFAZ: ${(e as Error).message}. Tente de novo.`;
      await registrarEventos(tx, { notaId: id, tipo: "cce", ambiente: nota.ambiente, transport, sucesso: false, erro: msg, sequencia });
      return { ok: false, mensagem: msg };
    }
    await registrarEventos(tx, { notaId: id, tipo: "cce", ambiente: nota.ambiente, transport, resultado: r, sucesso: r.ok, sequencia });
    return r.ok
      ? { ok: true, mensagem: `Carta de correção nº ${sequencia} registrada: ${r.xMotivo}` }
      : { ok: false, mensagem: [r.xMotivo, hintFor(r.cStat)].filter(Boolean).join(" — ") };
  });
}

/** Status do serviço de autorização da UF da empresa, no ambiente configurado. */
export async function statusSefaz() {
  const cert = await carregarCertificado();
  const emp = await db.query.empresa.findFirst();
  if (!emp?.uf) throw new Error("Cadastre a empresa antes.");
  const transport = new AuditTransport(15_000);
  try {
    const r = await serviceStatus(transport, cert, emp.uf, emp.ambienteNfe);
    await db.transaction((tx) =>
      registrarEventos(tx, { notaId: null, tipo: "status", ambiente: emp.ambienteNfe, transport, resultado: { cStat: r.cStat, xMotivo: r.xMotivo }, sucesso: r.cStat === "107" }),
    );
    return { online: r.cStat === "107", mensagem: `${r.cStat} · ${r.xMotivo}`, ambiente: emp.ambienteNfe, uf: emp.uf };
  } catch (e) {
    return { online: false, mensagem: `Sem resposta da SEFAZ: ${(e as Error).message}`, ambiente: emp.ambienteNfe, uf: emp.uf };
  }
}

/** XML para download: o nfeProc (autorizado) ou o NFe assinado. */
export async function arquivoXml(id: string) {
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (!nota?.xml) throw new Error("Esta nota ainda não tem XML.");
  return {
    xml: nota.xmlProc ?? `<?xml version="1.0" encoding="UTF-8"?>${nota.xml}`,
    nome: `${nota.chave}${nota.xmlProc ? "-procNFe" : "-nfe"}.xml`,
  };
}

export async function danfePdf(id: string) {
  const f = await arquivoXml(id);
  return { pdf: await gerarDanfe(f.xml), nome: f.nome.replace(/\.xml$/, ".pdf") };
}
