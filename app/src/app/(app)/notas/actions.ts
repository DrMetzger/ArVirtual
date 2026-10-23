"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { clientes, enderecos, notas, produtos, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ambienteFocus, cancelarNfe, consultarNfe, emitirNfe, mensagemFocus, montarPayload, type StatusFocus } from "@/lib/fiscal/focusnfe";
import { calcularItens, type ItemCalculado } from "@/lib/fiscal/matriz";
import { enviarEmail } from "@/lib/mail";
import { formatBRL } from "@/lib/utils";

const ItensSchema = z
  .array(
    z.object({
      produtoId: z.string().uuid(),
      quantidade: z.number().positive("Quantidade deve ser maior que zero"),
      valorUnitario: z.number().positive("Valor unitário deve ser maior que zero"),
    }),
  )
  .min(1, "Adicione ao menos um item");

const EntradaSchema = z.object({
  clienteId: z.string().uuid("Selecione o cliente"),
  enderecoId: z.string().uuid("Selecione o endereço de entrega"),
  itens: ItensSchema,
});
export type EntradaNota = z.infer<typeof EntradaSchema>;

async function calcular(entrada: EntradaNota) {
  const [emp, cliente, endereco, prods, regras] = await Promise.all([
    db.query.empresa.findFirst(),
    db.query.clientes.findFirst({ where: eq(clientes.id, entrada.clienteId) }),
    db.query.enderecos.findFirst({ where: and(eq(enderecos.id, entrada.enderecoId), eq(enderecos.clienteId, entrada.clienteId)) }),
    db.select().from(produtos).where(inArray(produtos.id, entrada.itens.map((i) => i.produtoId))),
    db.select().from(regrasFiscais),
  ]);
  if (!emp?.cnpj) throw new Error("Cadastre os dados da empresa (CNPJ, IE, UF) em Configurações › Empresa.");
  if (!cliente) throw new Error("Cliente não encontrado.");
  if (!endereco) throw new Error("Endereço não pertence ao cliente.");

  const itens = entrada.itens.map((i) => {
    const p = prods.find((x) => x.id === i.produtoId);
    if (!p) throw new Error("Produto não encontrado.");
    return {
      produtoId: p.id,
      sku: p.sku,
      nome: p.nome,
      ncm: p.ncm,
      cest: p.cest,
      origem: p.origem,
      unidade: p.unidade,
      gtin: p.gtin,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    };
  });
  const calc = calcularItens(regras, itens, {
    ufEmitente: emp.uf,
    regime: emp.regime,
    ufDestino: endereco.uf,
    indicadorIe: cliente.indicadorIe,
  });
  return { emp, cliente, endereco, calc };
}

export type Preview = {
  erro?: string;
  erros?: string[];
  itens?: ItemCalculado[];
  totalProdutos?: number;
  totalImpostos?: number;
  totalNota?: number;
  interna?: boolean;
};

export async function previsualizarNota(entrada: EntradaNota): Promise<Preview> {
  await requireUser();
  const parsed = EntradaSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
  try {
    const { calc } = await calcular(parsed.data);
    return { ...calc, erros: calc.erros };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function criarNota(entrada: EntradaNota): Promise<{ erro?: string }> {
  await requireUser();
  const parsed = EntradaSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
  let id: string;
  try {
    const { calc } = await calcular(parsed.data);
    if (calc.erros.length) return { erro: calc.erros.join(" ") };
    const regraNatureza = (await db.query.regrasFiscais.findFirst({ where: eq(regrasFiscais.id, calc.itens[0]!.regraId) }))
      ?.naturezaOperacao;
    const [nova] = await db
      .insert(notas)
      .values({
        referencia: `arv-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
        clienteId: parsed.data.clienteId,
        enderecoId: parsed.data.enderecoId,
        ambiente: await ambienteFocus(),
        naturezaOperacao: regraNatureza ?? "Venda de mercadoria",
        totalProdutos: calc.totalProdutos,
        totalImpostos: calc.totalImpostos,
        totalNota: calc.totalNota,
        itens: calc.itens,
      })
      .returning({ id: notas.id });
    id = nova!.id;
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/notas");
  redirect(`/notas/${id}`);
}

const STATUS_FOCUS: Record<string, "processando" | "autorizada" | "erro" | "cancelada"> = {
  processando_autorizacao: "processando",
  autorizado: "autorizada",
  erro_autorizacao: "erro",
  denegado: "erro",
  cancelado: "cancelada",
};

async function aplicarStatus(id: string, body: StatusFocus, base: string) {
  const link = (p?: string) => (p ? (p.startsWith("http") ? p : `${base}${p}`) : null);
  await db
    .update(notas)
    .set({
      status: STATUS_FOCUS[body.status] ?? "processando",
      numero: body.numero ?? null,
      serie: body.serie ?? null,
      chave: body.chave_nfe ?? null,
      danfeUrl: link(body.caminho_danfe),
      xmlUrl: link(body.caminho_xml_nota_fiscal),
      mensagem: mensagemFocus(body),
      resposta: body as object,
    })
    .where(eq(notas.id, id));
}

export async function emitirNota(id: string) {
  await requireUser();
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (!nota || !["rascunho", "erro"].includes(nota.status)) return;
  const cert = await db.query.certificadoDigital.findFirst({ columns: { validoAte: true } });
  if (cert && cert.validoAte.getTime() < Date.now()) {
    await db.update(notas).set({ status: "erro", mensagem: "Certificado digital A1 vencido. Troque em Configurações › Certificado A1." }).where(eq(notas.id, id));
    revalidatePath(`/notas/${id}`);
    return;
  }
  try {
    const { emp, cliente, endereco, calc } = await calcular({
      clienteId: nota.clienteId,
      enderecoId: nota.enderecoId ?? "",
      itens: (nota.itens as ItemCalculado[]).map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
    });
    const payload = montarPayload({
      empresa: emp,
      cliente,
      endereco,
      naturezaOperacao: nota.naturezaOperacao,
      interna: calc.interna,
      itens: calc.itens,
      totalProdutos: calc.totalProdutos,
      totalNota: calc.totalNota,
    });
    // Nova referência a cada tentativa: a Focus não aceita reenviar uma referência rejeitada.
    const referencia = nota.status === "erro" ? `${nota.referencia.split("~")[0]}~${Date.now().toString(36)}` : nota.referencia;
    const r = await emitirNfe(referencia, payload);
    await db.update(notas).set({ referencia, ambiente: r.ambiente, itens: calc.itens }).where(eq(notas.id, id));
    if (!r.ok && r.httpStatus !== 202) {
      await db.update(notas).set({ status: "erro", mensagem: mensagemFocus(r.body) || `Erro HTTP ${r.httpStatus}`, resposta: r.body as object }).where(eq(notas.id, id));
    } else {
      await aplicarStatus(id, r.body.status ? r.body : { status: "processando_autorizacao" }, r.base);
    }
  } catch (e) {
    await db.update(notas).set({ status: "erro", mensagem: (e as Error).message }).where(eq(notas.id, id));
  }
  revalidatePath(`/notas/${id}`);
}

export async function atualizarStatus(id: string) {
  await requireUser();
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (!nota || nota.status === "rascunho") return;
  try {
    const r = await consultarNfe(nota.referencia);
    if (r.ok) await aplicarStatus(id, r.body, r.base);
  } catch (e) {
    await db.update(notas).set({ mensagem: (e as Error).message }).where(eq(notas.id, id));
  }
  revalidatePath(`/notas/${id}`);
}

export async function cancelarNota(id: string, form: FormData) {
  await requireUser();
  const justificativa = String(form.get("justificativa") ?? "").trim();
  if (justificativa.length < 15) redirect(`/notas/${id}?erro=${encodeURIComponent("A justificativa precisa ter ao menos 15 caracteres.")}`);
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id) });
  if (nota?.status !== "autorizada") return;
  const r = await cancelarNfe(nota.referencia, justificativa);
  if (r.ok && r.body.status === "cancelado") {
    await db.update(notas).set({ status: "cancelada", mensagem: mensagemFocus(r.body), resposta: r.body as object }).where(eq(notas.id, id));
  } else {
    await db.update(notas).set({ mensagem: `Cancelamento recusado: ${mensagemFocus(r.body)}` }).where(eq(notas.id, id));
  }
  revalidatePath(`/notas/${id}`);
}

export async function excluirRascunho(id: string) {
  await requireUser();
  await db.delete(notas).where(and(eq(notas.id, id), inArray(notas.status, ["rascunho", "erro"])));
  revalidatePath("/notas");
  redirect("/notas");
}

export async function enviarNotaPorEmail(id: string) {
  await requireUser();
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id), with: { cliente: true } });
  if (!nota || nota.status !== "autorizada") return;
  let msg = "";
  try {
    if (!nota.cliente.email) throw new Error("O cliente não tem e-mail cadastrado.");
    await enviarEmail({
      para: nota.cliente.email,
      assunto: `Nota fiscal ${nota.numero ?? ""} - ArVirtual`,
      html: `<p>Olá, ${nota.cliente.nome}!</p>
<p>Segue a nota fiscal eletrônica nº <strong>${nota.numero}</strong>, no valor de <strong>${formatBRL(nota.totalNota)}</strong>.</p>
<p><a href="${nota.danfeUrl}">Baixar DANFE (PDF)</a> · <a href="${nota.xmlUrl}">Baixar XML</a></p>
<p>Chave de acesso: ${nota.chave}</p><p>Obrigado pela preferência!<br>ArVirtual</p>`,
    });
    msg = `E-mail enviado para ${nota.cliente.email}.`;
  } catch (e) {
    msg = `Falha ao enviar e-mail: ${(e as Error).message}`;
  }
  redirect(`/notas/${id}?aviso=${encodeURIComponent(msg)}`);
}
