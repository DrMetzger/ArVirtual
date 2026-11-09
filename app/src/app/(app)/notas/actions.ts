"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notas, pedidosMarketplace, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { escaparHtml, layoutEmail, paragrafo } from "@/lib/email-layout";
import { calcularNota, EntradaNotaSchema, type EntradaNota } from "@/lib/fiscal/calculo";
import type { ItemCalculado } from "@/lib/fiscal/matriz";
import { enviarEmail } from "@/lib/mail";
import { enviarNotaAoMarketplace } from "@/lib/marketplaces/enviar-nota";
import { arquivoXml, cancelarNota as cancelarNaSefaz, cartaCorrecao, danfePdf, FORMAS_PAGAMENTO, statusSefaz, transmitirNota } from "@/lib/nfe/emissor";
import { formatBRL } from "@/lib/utils";

export type Preview = {
  erro?: string;
  erros?: string[];
  avisos?: string[];
  itens?: ItemCalculado[];
  totalProdutos?: number;
  totalImpostos?: number;
  totalNota?: number;
  interna?: boolean;
};

export async function previsualizarNota(entrada: EntradaNota): Promise<Preview> {
  await requireUser();
  const parsed = EntradaNotaSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
  try {
    const { itens, erros, avisos, interna, totalProdutos, totalImpostos, totalNota } = await calcularNota(parsed.data);
    return { itens, erros, avisos, interna, totalProdutos, totalImpostos, totalNota };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function criarNota(entrada: EntradaNota & { formaPagamento: string; pedidoId?: number }): Promise<{ erro?: string }> {
  await requireUser();
  const parsed = EntradaNotaSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message };
  const forma = FORMAS_PAGAMENTO.some(([v]) => v === entrada.formaPagamento) ? entrada.formaPagamento : "99";
  let id: string;
  try {
    const calc = await calcularNota(parsed.data);
    if (calc.erros.length) return { erro: calc.erros.join(" ") };
    const regra = await db.query.regrasFiscais.findFirst({ where: eq(regrasFiscais.id, calc.itens[0]!.regraId) });
    const [nova] = await db
      .insert(notas)
      .values({
        clienteId: parsed.data.clienteId,
        enderecoId: parsed.data.enderecoId,
        naturezaOperacao: regra?.naturezaOperacao ?? "Venda de mercadoria",
        formaPagamento: forma,
        totalProdutos: calc.totalProdutos,
        totalImpostos: calc.totalImpostos,
        totalNota: calc.totalNota,
        frete: parsed.data.frete,
        desconto: parsed.data.desconto,
        itens: calc.itens,
      })
      .returning({ id: notas.id });
    id = nova!.id;
    if (entrada.pedidoId) await db.update(pedidosMarketplace).set({ notaId: id }).where(eq(pedidosMarketplace.id, entrada.pedidoId));
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/notas");
  revalidatePath("/pedidos");
  redirect(`/notas/${id}`);
}

const voltar = (id: string, tipo: "aviso" | "erro", msg: string) => redirect(`/notas/${id}?${tipo}=${encodeURIComponent(msg)}`);

export async function emitirNota(id: string) {
  await requireUser();
  try {
    await transmitirNota(id);
  } catch (e) {
    voltar(id, "erro", (e as Error).message);
  }
  // Autorizada e de pedido do Magalu: já informa a nota no pedido de lá.
  const envio = await enviarNotaAoMarketplace(id).catch((e: Error) => e.message);
  revalidatePath(`/notas/${id}`);
  revalidatePath("/notas");
  revalidatePath("/pedidos");
  if (envio === "enviada") voltar(id, "aviso", "NF-e autorizada e enviada ao Magalu: o pedido já está com a nota lá.");
  else if (envio) voltar(id, "erro", `NF-e autorizada, mas o Magalu não aceitou a nota: ${envio}. O ERP tenta de novo sozinho; você também pode usar "Sincronizar nota no Magalu".`);
}

/** Manda de novo ao marketplace a nota autorizada do pedido (tela da nota). */
export async function reenviarNotaMarketplace(id: string) {
  await requireUser();
  const envio = await enviarNotaAoMarketplace(id).catch((e: Error) => e.message);
  revalidatePath(`/notas/${id}`);
  if (envio === "enviada") voltar(id, "aviso", "Nota sincronizada: o pedido no Magalu está com esta NF-e.");
  voltar(id, "erro", envio ? `O Magalu não aceitou a nota: ${envio}` : "Esta nota não é de um pedido do Magalu.");
}

export async function cancelarNota(id: string, form: FormData) {
  await requireUser();
  const justificativa = String(form.get("justificativa") ?? "").trim();
  if (justificativa.length < 15) voltar(id, "erro", "A justificativa precisa ter ao menos 15 caracteres.");
  let r: { ok: boolean; mensagem: string };
  try {
    r = await cancelarNaSefaz(id, justificativa);
  } catch (e) {
    r = { ok: false, mensagem: (e as Error).message };
  }
  revalidatePath(`/notas/${id}`);
  voltar(id, r.ok ? "aviso" : "erro", r.ok ? `Nota cancelada na SEFAZ: ${r.mensagem}` : r.mensagem);
}

export async function corrigirNota(id: string, form: FormData) {
  await requireUser();
  const texto = String(form.get("correcao") ?? "").trim();
  if (texto.length < 15) voltar(id, "erro", "A correção precisa ter ao menos 15 caracteres.");
  let r: { ok: boolean; mensagem: string };
  try {
    r = await cartaCorrecao(id, texto);
  } catch (e) {
    r = { ok: false, mensagem: (e as Error).message };
  }
  revalidatePath(`/notas/${id}`);
  voltar(id, r.ok ? "aviso" : "erro", r.mensagem);
}

export async function excluirRascunho(id: string) {
  await requireUser();
  // Só rascunho sem número: nota numerada precisa ser inutilizada na SEFAZ, não apagada.
  await db.delete(notas).where(and(eq(notas.id, id), inArray(notas.status, ["rascunho", "rejeitada"])));
  revalidatePath("/notas");
  redirect("/notas");
}

export async function consultarStatusSefaz() {
  await requireUser();
  let msg: string;
  try {
    const r = await statusSefaz();
    msg = `SEFAZ ${r.uf} (${r.ambiente === "producao" ? "produção" : "homologação"}): ${r.online ? "em operação" : "fora do ar"} · ${r.mensagem}`;
  } catch (e) {
    msg = (e as Error).message;
  }
  redirect(`/notas?status=${encodeURIComponent(msg)}`);
}

export async function enviarNotaPorEmail(id: string) {
  await requireUser();
  const nota = await db.query.notas.findFirst({ where: eq(notas.id, id), with: { cliente: true } });
  if (!nota || nota.status !== "autorizada") return;
  let msg: string;
  try {
    if (!nota.cliente.email) throw new Error("O cliente não tem e-mail cadastrado.");
    const [xml, danfe] = await Promise.all([arquivoXml(id), danfePdf(id)]);
    await enviarEmail({
      para: nota.cliente.email,
      assunto: `Nota fiscal ${nota.numero} - ArVirtual`,
      html: layoutEmail({
        titulo: `Nota fiscal nº ${nota.numero}`,
        resumo: `NF-e ${nota.numero} no valor de ${formatBRL(nota.totalNota)}: DANFE e XML em anexo.`,
        corpo:
          paragrafo(`Olá, <strong>${escaparHtml(nota.cliente.nome)}</strong>!`) +
          paragrafo(`Segue em anexo a nota fiscal eletrônica nº <strong>${nota.numero}</strong> (DANFE em PDF e XML), no valor de <strong>${formatBRL(nota.totalNota)}</strong>.`) +
          paragrafo(`Chave de acesso:<br><span style="font-family:Consolas,monospace;font-size:13px;color:#0b2a4f">${(nota.chave ?? "").replace(/(\d{4})(?=\d)/g, "$1 ")}</span>`) +
          paragrafo("Obrigado pela preferência!"),
      }),
      anexos: [
        { filename: danfe.nome, content: danfe.pdf },
        { filename: xml.nome, content: Buffer.from(xml.xml, "utf8") },
      ],
    });
    msg = `E-mail enviado para ${nota.cliente.email} com DANFE e XML.`;
  } catch (e) {
    msg = `Falha ao enviar e-mail: ${(e as Error).message}`;
  }
  voltar(id, msg.startsWith("Falha") ? "erro" : "aviso", msg);
}
