"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clientes, pedidosMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { atualizarEstoqueDoPedido } from "@/lib/estoque";
import { sincronizarPedidos } from "@/lib/marketplaces";
import type { Situacao } from "@/lib/marketplaces/situacao";
import { cadastrarClienteDoPedido } from "@/lib/pedidos";

export async function sincronizarAgora(dias: number) {
  await requireUser();
  const r = await sincronizarPedidos(dias);
  revalidatePath("/pedidos");
  revalidatePath("/");
  const erros = r.filter((x) => x.erro);
  const total = r.reduce((s, x) => s + x.pedidos, 0);
  const q = erros.length
    ? `erro=${encodeURIComponent(erros.map((e) => `${e.conta}: ${e.erro}`).join(" | "))}`
    : `ok=${encodeURIComponent(r.length ? `${total} pedido(s) atualizados de ${r.length} conta(s).` : "Nenhuma conta conectada: conecte em Marketplaces.")}`;
  redirect(`/pedidos?${q}`);
}

/** Cadastra o comprador e abre a nota fiscal já preenchida com o pedido. */
export async function faturarPedido(id: number) {
  await requireUser();
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido) redirect("/pedidos");
  if (pedido.notaId) redirect(`/notas/${pedido.notaId}`);
  let erro = "";
  try {
    await cadastrarClienteDoPedido(pedido);
  } catch (e) {
    erro = (e as Error).message;
  }
  redirect(`/notas/nova?pedido=${id}${erro ? `&aviso=${encodeURIComponent(erro)}` : ""}`);
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
    id = pedido!.id;
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath("/pedidos");
  revalidatePath("/estoque");
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
  if (p) await atualizarEstoqueDoPedido(p);
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  revalidatePath("/estoque");
}
