import "server-only";
import { parseNFeXml } from "@brasil-fiscal/nfe/dist/infra/danfe/xml-parser";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { filamentos, fornecedores, itensNotaEntrada, movimentosEstoque, movimentosFilamento, notasEntrada } from "@/db/schema";
import { movimentar } from "@/lib/estoque";
import { movimentarFilamento } from "@/lib/filamentos";
import { cancelarTitulosDaOrigem, gerarPagarDaNota } from "@/lib/financeiro";
import { onlyDigits, round2 } from "@/lib/utils";

const num = (v: string | undefined) => Number(String(v ?? "0").replace(",", ".")) || 0;
const MATERIAIS = ["PLA+", "PLA", "PETG", "ABS", "ASA", "TPU", "PA", "PC", "HIPS", "PVA"];

/** Data da NF-e (AAAA-MM-DD, AAAA-MM-DDTHH:MM:SS-03:00 ou DD/MM/AAAA) para AAAA-MM-DD. */
function dataIso(v: string | undefined) {
  if (!v) return "";
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : v.slice(0, 10);
}

/** Palpite do item: filamento (pelo nome) com o peso do rolo, ou despesa. */
function destinoProvavel(descricao: string, lista: { id: number; material: string; cor: string }[]) {
  const d = descricao.toUpperCase();
  const ehFilamento = /FILAMENTO|\b(PLA\+?|PETG|ABS|ASA|TPU)\b/.test(d);
  if (!ehFilamento) return { destino: "despesa" as const, filamentoId: null, gramasPorUnidade: 1000 };
  const material = MATERIAIS.find((m) => d.includes(m)) ?? "";
  const filamento = lista.find((f) => f.material.toUpperCase() === material && d.includes(f.cor.toUpperCase()));
  const kg = d.match(/(\d+(?:[.,]\d+)?)\s*KG/);
  const g = d.match(/(\d{3,4})\s*G\b/);
  const gramasPorUnidade = kg ? Math.round(num(kg[1]) * 1000) : g ? Number(g[1]) : 1000;
  return { destino: "filamento" as const, filamentoId: filamento?.id ?? null, gramasPorUnidade };
}

/** Importa o XML da NF-e de compra: cadastra o fornecedor (se novo) e cria a nota em rascunho para conferir. */
export async function importarXmlEntrada(xml: string) {
  if (!xml.includes("<infNFe")) throw new Error("Arquivo não é um XML de NF-e.");
  const nfe = parseNFeXml(xml);
  const chave = onlyDigits(nfe.chaveAcesso);
  if (chave) {
    const existe = await db.query.notasEntrada.findFirst({ where: eq(notasEntrada.chave, chave), columns: { id: true } });
    if (existe) throw new Error(`Esta NF-e já foi importada (entrada nº ${existe.id}).`);
  }
  const doc = onlyDigits(nfe.emitente.cnpj);
  const lista = await db.select({ id: filamentos.id, material: filamentos.material, cor: filamentos.cor }).from(filamentos);

  return db.transaction(async (tx) => {
    let forn = doc ? await tx.query.fornecedores.findFirst({ where: eq(fornecedores.documento, doc) }) : undefined;
    if (!forn) {
      [forn] = await tx
        .insert(fornecedores)
        .values({
          tipo: doc.length === 11 ? "PF" : "PJ",
          documento: doc || `sem-doc-${Date.now()}`,
          nome: nfe.emitente.nome,
          nomeFantasia: nfe.emitente.fantasia ?? "",
          inscricaoEstadual: nfe.emitente.ie ?? "",
          telefone: onlyDigits(nfe.emitente.fone ?? ""),
          cidade: nfe.emitente.cidade,
          uf: nfe.emitente.uf,
        })
        .returning();
    }
    const t = nfe.totais;
    const parcelas = (nfe.duplicatas ?? []).map((d) => ({ vencimento: dataIso(d.vencimento), valor: num(d.valor) }));
    const [nota] = await tx
      .insert(notasEntrada)
      .values({
        fornecedorId: forn!.id,
        numero: nfe.numero,
        serie: nfe.serie,
        chave: chave || null,
        emissao: dataIso(nfe.dataEmissao) ? new Date(`${dataIso(nfe.dataEmissao)}T12:00:00-03:00`) : null,
        valorProdutos: num(t.valorProdutos),
        frete: num(t.valorFrete),
        outras: num(t.outrasDespesas) + num(t.valorSeguro) + num(t.valorIpi) + num(t.valorIcmsSt),
        desconto: num(t.desconto),
        valorTotal: num(t.valorNfe),
        parcelas: parcelas.length ? parcelas : [{ vencimento: dataIso(nfe.dataEmissao) || new Date().toISOString().slice(0, 10), valor: num(t.valorNfe) }],
        xml,
      })
      .returning({ id: notasEntrada.id });
    await tx.insert(itensNotaEntrada).values(
      nfe.produtos.map((p) => ({
        notaId: nota!.id,
        codigo: p.codigo,
        descricao: p.descricao,
        ncm: p.ncm,
        cfop: p.cfop,
        unidade: p.unidade,
        quantidade: num(p.quantidade),
        valorUnitario: num(p.valorUnitario),
        valorTotal: num(p.valorTotal),
        ...destinoProvavel(p.descricao, lista),
      })),
    );
    return nota!.id;
  });
}

/** Lança a nota: filamentos e produtos entram no estoque; o custo inclui frete, outras despesas e desconto rateados. */
export async function lancarNotaEntrada(notaId: number, usuarioId: string) {
  return db.transaction(async (tx) => {
    const nota = await tx.query.notasEntrada.findFirst({ where: eq(notasEntrada.id, notaId), with: { itens: true } });
    if (!nota) throw new Error("Nota não encontrada.");
    if (nota.status !== "rascunho") throw new Error("Esta nota já foi lançada ou cancelada.");
    if (!nota.itens.length) throw new Error("A nota não tem itens.");
    for (const i of nota.itens) {
      if (i.destino === "filamento" && !i.filamentoId) throw new Error(`Escolha o filamento do item "${i.descricao}".`);
      if (i.destino === "produto" && !i.produtoId) throw new Error(`Escolha o produto do item "${i.descricao}".`);
    }
    const base = nota.itens.reduce((s, i) => s + i.valorTotal, 0) || 1;
    const extra = nota.frete + nota.outras - nota.desconto;
    const origem = `nota-entrada:${nota.id}`;
    const ref = `NF ${nota.numero || nota.id}`;
    for (const i of nota.itens) {
      const custoItem = i.valorTotal + extra * (i.valorTotal / base);
      if (i.destino === "filamento") {
        const gramas = Math.round(i.quantidade * i.gramasPorUnidade);
        await movimentarFilamento(tx, {
          filamentoId: i.filamentoId!,
          gramas,
          tipo: "entrada",
          custoKg: gramas ? round2(custoItem / (gramas / 1000)) : 0,
          origem,
          observacao: `${ref} · ${i.descricao}`,
          usuarioId,
        });
      } else if (i.destino === "produto") {
        await movimentar(tx, { produtoId: i.produtoId!, quantidade: Math.round(i.quantidade), tipo: "entrada", origem, observacao: `${ref} · ${i.descricao}`, usuarioId });
      }
    }
    await tx.update(notasEntrada).set({ status: "lancada", lancadaEm: new Date(), atualizadoEm: new Date() }).where(eq(notasEntrada.id, nota.id));
    await gerarPagarDaNota(tx, nota);
  });
}

/** Cancela uma nota lançada: estorna o que ela colocou no estoque (o custo médio do filamento não volta). */
export async function cancelarNotaEntrada(notaId: number, usuarioId: string) {
  return db.transaction(async (tx) => {
    const nota = await tx.query.notasEntrada.findFirst({ where: eq(notasEntrada.id, notaId) });
    if (!nota || nota.status === "cancelada") throw new Error("Nota não encontrada ou já cancelada.");
    const origem = `nota-entrada:${nota.id}`;
    if (nota.status === "lancada") {
      const fil = await tx.select().from(movimentosFilamento).where(and(eq(movimentosFilamento.origem, origem), eq(movimentosFilamento.tipo, "entrada")));
      for (const m of fil) {
        await movimentarFilamento(tx, { filamentoId: m.filamentoId, gramas: -m.gramas, tipo: "estorno", origem, observacao: `Cancelamento NF ${nota.numero || nota.id}`, usuarioId });
      }
      const prods = await tx.select().from(movimentosEstoque).where(and(eq(movimentosEstoque.origem, origem), eq(movimentosEstoque.tipo, "entrada")));
      for (const m of prods) {
        await movimentar(tx, { produtoId: m.produtoId, quantidade: -m.quantidade, tipo: "estorno", origem, observacao: `Cancelamento NF ${nota.numero || nota.id}`, usuarioId });
      }
    }
    await tx.update(notasEntrada).set({ status: "cancelada", atualizadoEm: new Date() }).where(eq(notasEntrada.id, nota.id));
    await cancelarTitulosDaOrigem(tx, origem);
  });
}
