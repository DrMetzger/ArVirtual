import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes, enderecos, produtos } from "@/db/schema";
import { carregarContextoFiscal } from "./contexto";
import { calcularItens } from "./matriz";

export const EntradaNotaSchema = z.object({
  clienteId: z.uuid("Selecione o cliente"),
  enderecoId: z.uuid("Selecione o endereço de entrega"),
  itens: z
    .array(
      z.object({
        produtoId: z.uuid(),
        quantidade: z.number().positive("Quantidade deve ser maior que zero"),
        valorUnitario: z.number().positive("Valor unitário deve ser maior que zero"),
      }),
    )
    .min(1, "Adicione ao menos um item"),
  /** Frete cobrado do comprador e desconto da venda (o total da nota fica igual ao que ele pagou). */
  frete: z.number().nonnegative("Frete não pode ser negativo").default(0),
  desconto: z.number().nonnegative("Desconto não pode ser negativo").default(0),
});
export type EntradaNota = z.input<typeof EntradaNotaSchema>;

/** Impostos da nota com o cadastro atual (cliente, endereço, produtos, matriz fiscal, ICMS por UF, NCM). */
export async function calcularNota(entrada: EntradaNota) {
  const [cliente, endereco, prods] = await Promise.all([
    db.query.clientes.findFirst({ where: eq(clientes.id, entrada.clienteId) }),
    db.query.enderecos.findFirst({ where: and(eq(enderecos.id, entrada.enderecoId), eq(enderecos.clienteId, entrada.clienteId)) }),
    db.select().from(produtos).where(inArray(produtos.id, entrada.itens.map((i) => i.produtoId))),
  ]);
  if (!cliente) throw new Error("Cliente não encontrado.");
  if (!endereco) throw new Error("Endereço não pertence ao cliente.");
  const { regras, ctx } = await carregarContextoFiscal({ uf: endereco.uf, indicadorIe: cliente.indicadorIe });

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
  return { cliente, endereco, ...calcularItens(regras, itens, ctx, { frete: entrada.frete, desconto: entrada.desconto }) };
}
