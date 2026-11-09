"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clientes, contasMarketplace, movimentosEstoque, notas, pedidosMarketplace, produtos, vinculosSku } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { notaVale } from "@/lib/nota-pedido";
import { z } from "zod";
import { atualizarEstoqueDoPedido, movimentar } from "@/lib/estoque";
import { atualizarFinanceiroDoPedido } from "@/lib/financeiro";
import { adapter, buscarNotasDosPedidos, contaComToken, sincronizarPedidos } from "@/lib/marketplaces";
import { enviarNotaAoMarketplace } from "@/lib/marketplaces/enviar-nota";
import { importarNotasDoPedido } from "@/lib/marketplaces/notas-externas";
import type { Situacao } from "@/lib/marketplaces/situacao";
import { cadastrarClienteDoPedido, garantirEnderecoEntrega } from "@/lib/pedidos";

/** Botão Sincronizar (Pedidos e Marketplaces): só novidades, ou os pedidos comprados no período, numa conta ou em todas. */
export async function sincronizarManual(voltar: string, form: FormData) {
  await requireUser();
  const conta = Number(form.get("conta")) || undefined;
  // Datas do formulário são dias no horário de Brasília.
  const de = new Date(`${form.get("de")}T00:00:00-03:00`);
  const ate = new Date(`${form.get("ate")}T23:59:59-03:00`);
  const novidades = form.get("modo") === "novidades" || Number.isNaN(de.getTime());
  const r = novidades
    ? await sincronizarPedidos({ tipo: "novidades" })
    : await sincronizarPedidos({
        tipo: "periodo",
        desde: de,
        ate: Number.isNaN(ate.getTime()) || ate > new Date() ? undefined : ate,
        contas: conta ? [conta] : undefined,
      });
  revalidatePath("/pedidos");
  revalidatePath("/");
  const erros = r.filter((x) => x.erro);
  const total = r.reduce((s, x) => s + x.pedidos, 0);
  const q = erros.length
    ? `erro=${encodeURIComponent(erros.map((e) => `${e.conta}: ${e.erro}`).join(" | "))}`
    : `ok=${encodeURIComponent(r.length ? `${total} pedido(s) ${novidades ? "novos ou alterados" : "no período"}, de ${r.length} conta(s).` : "Nenhuma conta conectada: conecte em Marketplaces.")}`;
  redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}${q}`);
}

/** Puxa do marketplace (Magalu) as NF-e emitidas fora e liga aos pedidos. */
export async function buscarNotas(voltar: string) {
  await requireUser();
  let q: string;
  try {
    const r = await buscarNotasDosPedidos();
    q = r.erros.length
      ? `erro=${encodeURIComponent(`${r.notas} nota(s) importada(s); falhas: ${r.erros.slice(0, 3).join(" | ")}`)}`
      : `ok=${encodeURIComponent(r.pedidos ? `${r.notas} nota(s) encontrada(s) em ${r.pedidos} pedido(s).` : "Todos os pedidos faturados já estão com a nota.")}`;
  } catch (e) {
    q = `erro=${encodeURIComponent((e as Error).message)}`;
  }
  revalidatePath("/pedidos");
  redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}${q}`);
}

/** Puxa a nota de um pedido só (tela do pedido). */
export async function buscarNotaDoPedido(id: number) {
  await requireUser();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido?.contaId) redirect(`/pedidos/${id}`);
  const conta = await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId) });
  let q: string;
  try {
    if (!conta) throw new Error("A conta do marketplace deste pedido não está mais conectada.");
    const n = await importarNotasDoPedido(adapter(conta.marketplace), await contaComToken(conta), pedido);
    q = n ? `ok=${encodeURIComponent(`${n} nota(s) encontrada(s) no ${conta.nome}.`)}` : `erro=${encodeURIComponent("O marketplace não tem nota informada para este pedido.")}`;
  } catch (e) {
    q = `erro=${encodeURIComponent((e as Error).message)}`;
  }
  revalidatePath(`/pedidos/${id}`);
  redirect(`/pedidos/${id}?${q}`);
}

/** Manda ao Magalu a NF-e do ERP deste pedido (o mesmo que acontece sozinho ao autorizar a nota). */
export async function sincronizarNotaMagalu(id: number) {
  await requireUser();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id), columns: { notaId: true } });
  const envio = pedido?.notaId ? await enviarNotaAoMarketplace(pedido.notaId).catch((e: Error) => e.message) : null;
  const q =
    envio === "enviada"
      ? `ok=${encodeURIComponent("Nota sincronizada: o pedido no Magalu está com a NF-e emitida aqui.")}`
      : `erro=${encodeURIComponent(envio ? `O Magalu não aceitou a nota: ${envio}` : "Este pedido ainda não tem NF-e autorizada no ERP.")}`;
  revalidatePath(`/pedidos/${id}`);
  redirect(`/pedidos/${id}?${q}`);
}

/** Cadastra o comprador e abre a nota fiscal já preenchida com o pedido. */
export async function faturarPedido(id: number) {
  await requireUser();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) redirect("/pedidos");
  if (pedido.notaId) {
    const nota = await db.query.notas.findFirst({ where: eq(notas.id, pedido.notaId), columns: { status: true } });
    if (notaVale(nota?.status)) redirect(`/notas/${pedido.notaId}`);
  }
  let erro = "";
  let endereco: string | null = null;
  try {
    const clienteId = await cadastrarClienteDoPedido(pedido);
    endereco = await garantirEnderecoEntrega(clienteId, pedido);
  } catch (e) {
    erro = (e as Error).message;
  }
  redirect(`/notas/nova?pedido=${id}${endereco ? `&endereco=${endereco}` : ""}${erro ? `&aviso=${encodeURIComponent(erro)}` : ""}`);
}

/** Liga o item do pedido a um produto do cadastro; vale para os próximos pedidos com o mesmo SKU/anúncio. */
export async function vincularProduto(pedidoId: number, chaves: string[], _: unknown, form: FormData) {
  await requireUser();
  const produtoId = String(form.get("produtoId") ?? "");
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, pedidoId) });
  if (!pedido || !/^[0-9a-f-]{36}$/.test(produtoId)) return { erro: "Escolha o produto." };
  for (const chave of chaves.filter(Boolean)) {
    await db
      .insert(vinculosSku)
      .values({ canal: pedido.marketplace, chave, produtoId })
      .onConflictDoUpdate({ target: [vinculosSku.canal, vinculosSku.chave], set: { produtoId } });
  }
  // Pedido recente já vendido: o item que estava sem produto agora sai do estoque (histórico não mexe).
  const conta = pedido.contaId ? await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId) }) : undefined;
  const historico = conta ? pedido.data.getTime() < conta.criadoEm.getTime() - 86400_000 : false;
  if (pedido.estoqueBaixado && !historico) {
    const ja = await db.query.movimentosEstoque.findFirst({ where: and(eq(movimentosEstoque.origem, `pedido:${pedido.id}`), eq(movimentosEstoque.produtoId, produtoId)) });
    const qtd = pedido.itens.filter((i) => chaves.includes(i.sku) || chaves.includes(i.idAnuncio)).reduce((s, i) => s + i.quantidade, 0);
    if (!ja && qtd) {
      await db.transaction((tx) => movimentar(tx, { produtoId, quantidade: -qtd, tipo: "venda", origem: `pedido:${pedido.id}`, observacao: `Venda ${pedido.idExterno}` }));
    }
  }
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath("/estoque");
  return { ok: "Vinculado." };
}

// ---------- Pedido manual (loja própria) ----------
const ItemManual = z.object({ produtoId: z.uuid(), quantidade: z.number().int().positive(), valorUnitario: z.number().nonnegative() });
const PedidoManualSchema = z.object({
  clienteId: z.uuid().optional(),
  itens: z.array(ItemManual).min(1, "Adicione ao menos um item"),
  desconto: z.number().nonnegative(),
  frete: z.number().nonnegative(),
  situacao: z.enum(["aguardando", "pago", "enviado", "entregue"]),
  data: z.string().optional(),
  observacoes: z.string().max(2000),
});
export type PedidoManual = z.infer<typeof PedidoManualSchema>;

export async function criarPedidoManual(entrada: PedidoManual): Promise<{ erro?: string }> {
  const user = await requireUser();
  const parsed = PedidoManualSchema.safeParse(entrada);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  let id: number;
  try {
    const [lista, cliente] = await Promise.all([
      db.select().from(produtos).where(inArray(produtos.id, d.itens.map((i) => i.produtoId))),
      d.clienteId ? db.query.clientes.findFirst({ where: eq(clientes.id, d.clienteId), with: { enderecos: true } }) : undefined,
    ]);
    const itens = d.itens.map((i) => {
      const p = lista.find((x) => x.id === i.produtoId);
      if (!p) throw new Error("Produto não encontrado.");
      return { idAnuncio: "", sku: p.sku, titulo: p.nome, quantidade: i.quantidade, valorUnitario: i.valorUnitario };
    });
    const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
    const end = cliente?.enderecos.find((e) => e.principal) ?? cliente?.enderecos[0];
    const [novo] = await db
      .insert(pedidosMarketplace)
      .values({
        marketplace: "loja",
        idExterno: `tmp-${Date.now()}-${Math.random()}`,
        status: d.situacao,
        total: Math.round((subtotal - d.desconto + d.frete) * 100) / 100,
        frete: d.frete,
        desconto: d.desconto,
        comprador: cliente?.nome ?? "Consumidor final",
        data: d.data ? new Date(`${d.data}T12:00:00-03:00`) : new Date(),
        itens,
        clienteId: cliente?.id ?? null,
        observacoes: d.observacoes,
        entrega: end
          ? {
              nome: cliente!.nome,
              documento: cliente!.documento,
              telefone: cliente!.telefone,
              endereco: [end.logradouro, end.numero, end.complemento, end.bairro].filter(Boolean).join(", "),
              logradouro: end.logradouro,
              numero: end.numero,
              complemento: end.complemento,
              bairro: end.bairro,
              cidade: end.cidade,
              uf: end.uf,
              cep: end.cep,
            }
          : null,
        dados: { criadoPor: user.sub },
      })
      .returning();
    // Número da loja: SL-000001, SL-000002... (sequência própria, sem buracos dos pedidos de marketplace)
    const [seq] = await db.execute<{ n: string }>(sql`select nextval('pedido_loja_seq') as n`);
    const [pedido] = await db
      .update(pedidosMarketplace)
      .set({ idExterno: `SL-${String(seq!.n).padStart(6, "0")}` })
      .where(eq(pedidosMarketplace.id, novo!.id))
      .returning();
    await atualizarEstoqueDoPedido(pedido!);
    await atualizarFinanceiroDoPedido(pedido!);
    id = pedido!.id;
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/pedidos");
  revalidatePath("/estoque");
  revalidatePath("/financeiro", "layout");
  redirect(`/pedidos/${id}`);
}

/** Muda a situação de um pedido da loja própria (os dos marketplaces vêm da sincronização). */
export async function alterarSituacao(id: number, situacao: Situacao) {
  await requireUser();
  const [p] = await db
    .update(pedidosMarketplace)
    .set({ status: situacao, atualizadoEm: new Date() })
    .where(and(eq(pedidosMarketplace.id, id), eq(pedidosMarketplace.marketplace, "loja")))
    .returning();
  if (p) {
    await atualizarEstoqueDoPedido(p);
    await atualizarFinanceiroDoPedido(p);
  }
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  revalidatePath("/estoque");
}
