import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, clientes, enderecos, produtos, vinculosSku, type Marketplace, type PedidoMarketplace } from "@/db/schema";
import { consultarCep } from "@/lib/consultas";
import { isValidCnpj, isValidCpf } from "@/lib/documento";
import { onlyDigits } from "@/lib/utils";

export type ItemVinculado = PedidoMarketplace["itens"][number] & { produto: { id: string; nome: string; sku: string } | null };

/** Liga cada item do pedido ao produto do cadastro: pelo anúncio publicado pelo sistema ou pelo SKU. */
export async function vincularItens(pedido: PedidoMarketplace): Promise<ItemVinculado[]> {
  const ids = pedido.itens.map((i) => i.idAnuncio).filter(Boolean);
  const skus = pedido.itens.map((i) => i.sku).filter(Boolean);
  const chaves = [...new Set([...ids, ...skus])];
  const [porAnuncio, porSku, porVinculo] = await Promise.all([
    ids.length && pedido.marketplace !== "loja"
      ? db
          .select({ idExterno: anuncios.idExterno, id: produtos.id, nome: produtos.nome, sku: produtos.sku })
          .from(anuncios)
          .innerJoin(produtos, eq(produtos.id, anuncios.produtoId))
          .where(and(eq(anuncios.marketplace, pedido.marketplace as Marketplace), inArray(anuncios.idExterno, ids)))
      : [],
    skus.length ? db.select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku }).from(produtos).where(and(inArray(produtos.sku, skus), eq(produtos.temVariacoes, false))) : [],
    // Vínculo feito na tela do pedido (SKU do anúncio diferente do SKU do cadastro).
    chaves.length
      ? db
          .select({ chave: vinculosSku.chave, id: produtos.id, nome: produtos.nome, sku: produtos.sku })
          .from(vinculosSku)
          .innerJoin(produtos, eq(produtos.id, vinculosSku.produtoId))
          .where(and(eq(vinculosSku.canal, pedido.marketplace), inArray(vinculosSku.chave, chaves)))
      : [],
  ]);
  return pedido.itens.map((i) => {
    const a = porAnuncio.find((x) => x.idExterno === i.idAnuncio);
    const v = porVinculo.find((x) => x.chave === i.sku) ?? porVinculo.find((x) => x.chave === i.idAnuncio);
    const p = a ?? v ?? porSku.find((x) => x.sku === i.sku);
    return { ...i, produto: p ? { id: p.id, nome: p.nome, sku: p.sku } : null };
  });
}

/** CPF/CNPJ válido do comprador, quando o marketplace informa. */
export function documentoDoPedido(pedido: PedidoMarketplace) {
  const doc = onlyDigits(pedido.entrega?.documento ?? "");
  return (doc.length === 11 && isValidCpf(doc)) || (doc.length === 14 && isValidCnpj(doc)) ? doc : "";
}

export async function clienteDoPedido(pedido: PedidoMarketplace) {
  if (pedido.clienteId) {
    const c = await db.query.clientes.findFirst({ where: eq(clientes.id, pedido.clienteId), with: { enderecos: true } });
    if (c) return c;
  }
  const doc = documentoDoPedido(pedido);
  if (!doc) return null;
  return (await db.query.clientes.findFirst({ where: eq(clientes.documento, doc), with: { enderecos: true } })) ?? null;
}

/** Cadastra o comprador (e o endereço de entrega) a partir do pedido. O CEP completa logradouro, bairro e código IBGE. */
export async function cadastrarClienteDoPedido(pedido: PedidoMarketplace) {
  const existente = await clienteDoPedido(pedido);
  if (existente) return existente.id;
  const e = pedido.entrega;
  const doc = documentoDoPedido(pedido);
  if (!e || !doc) throw new Error("O pedido não tem CPF/CNPJ do comprador: cadastre o cliente manualmente.");

  const cep = onlyDigits(e.cep);
  const viaCep = cep.length === 8 ? await consultarCep(cep).catch(() => null) : null;
  // Sem número separado, tenta achar no texto ("Rua X, 123 - ...").
  const numero = e.numero || e.endereco.match(/,\s*(\d+[A-Za-z]?)\b/)?.[1] || "S/N";
  const logradouro = e.logradouro || viaCep?.logradouro || e.endereco.split(",")[0] || e.endereco;

  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(clientes)
      .values({
        tipo: doc.length === 14 ? "PJ" : "PF",
        documento: doc,
        nome: e.nome || pedido.comprador || "Comprador",
        indicadorIe: 9,
        telefone: onlyDigits(e.telefone ?? "").replace(/^55(?=\d{10,11}$)/, ""),
        observacoes: `Cadastrado a partir do pedido ${pedido.idExterno} (${pedido.marketplace}).`,
      })
      .returning({ id: clientes.id });
    await tx.insert(enderecos).values({
      clienteId: c!.id,
      apelido: "Entrega",
      cep,
      logradouro,
      numero,
      complemento: e.complemento ?? "",
      bairro: e.bairro || viaCep?.bairro || "",
      cidade: viaCep?.cidade || e.cidade,
      uf: (viaCep?.uf || e.uf).toUpperCase().slice(0, 2),
      codigoIbge: viaCep?.codigoIbge ?? "",
      principal: true,
    });
    return c!.id;
  });
}

/** Endereço de entrega do pedido no cadastro do cliente (cria se ainda não existir), para a NF-e sair com ele. */
export async function garantirEnderecoEntrega(clienteId: string, pedido: PedidoMarketplace): Promise<string | null> {
  const e = pedido.entrega;
  const cep = onlyDigits(e?.cep ?? "");
  const lista = await db.select().from(enderecos).where(eq(enderecos.clienteId, clienteId));
  if (!e || cep.length !== 8) return lista.find((x) => x.principal)?.id ?? lista[0]?.id ?? null;
  const numero = e.numero || e.endereco.match(/,\s*(\d+[A-Za-z]?)\b/)?.[1] || "S/N";
  const igual = lista.find((x) => onlyDigits(x.cep) === cep && x.numero.trim().toUpperCase() === numero.trim().toUpperCase());
  if (igual) return igual.id;
  const viaCep = await consultarCep(cep).catch(() => null);
  const [novo] = await db
    .insert(enderecos)
    .values({
      clienteId,
      apelido: `Entrega ${pedido.idExterno}`.slice(0, 40),
      cep,
      logradouro: e.logradouro || viaCep?.logradouro || e.endereco.split(",")[0] || e.endereco,
      numero,
      complemento: e.complemento && e.complemento !== "N/A" ? e.complemento : "",
      bairro: e.bairro || viaCep?.bairro || "",
      cidade: viaCep?.cidade || e.cidade,
      uf: (viaCep?.uf || e.uf).toUpperCase().slice(0, 2),
      codigoIbge: viaCep?.codigoIbge ?? "",
      principal: lista.length === 0,
    })
    .returning({ id: enderecos.id });
  return novo!.id;
}
