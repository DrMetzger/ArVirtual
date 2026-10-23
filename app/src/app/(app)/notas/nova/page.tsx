import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, pedidosMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { FORMAS_PAGAMENTO } from "@/lib/nfe/emissor";
import { clienteDoPedido, vincularItens } from "@/lib/pedidos";
import { NotaForm } from "../nota-form";

export const metadata: Metadata = { title: "Nova nota fiscal" };

export default async function NovaNotaPage({ searchParams }: { searchParams: Promise<{ pedido?: string; aviso?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const pedido = sp.pedido ? await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, Number(sp.pedido) || 0) }) : undefined;
  const [listaClientes, listaProdutos] = await Promise.all([
    db.query.clientes.findMany({
      columns: { id: true, nome: true, documento: true },
      with: { enderecos: { columns: { id: true, apelido: true, cidade: true, uf: true, principal: true } } },
      orderBy: asc(clientes.nome),
      limit: 1000,
    }),
    db
      .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, preco: produtos.preco, estoque: produtos.estoque })
      .from(produtos)
      .where(eq(produtos.ativo, true))
      .orderBy(asc(produtos.nome)),
  ]);

  // Nota a partir de um pedido de marketplace: comprador, endereço e itens já preenchidos.
  let iniciais;
  if (pedido) {
    const [cliente, itens] = await Promise.all([clienteDoPedido(pedido), vincularItens(pedido)]);
    iniciais = {
      pedidoId: pedido.id,
      clienteId: cliente?.id ?? "",
      enderecoId: cliente?.enderecos.find((e) => e.principal)?.id ?? cliente?.enderecos[0]?.id ?? "",
      itens: itens.map((i) => ({ produtoId: i.produto?.id ?? "", quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
    };
  }
  return (
    <>
      <PageHeader
        title="Nova nota fiscal"
        description={
          pedido
            ? `Pedido ${pedido.idExterno} do ${MARKETPLACE_INFO[pedido.marketplace].nome}: confira e salve; a emissão vai direto para a SEFAZ.`
            : "Monte a nota, confira os impostos e salve como rascunho; a emissão vai direto para a SEFAZ."
        }
      />
      {sp.aviso ? (
        <div className="mb-6">
          <Alert tone="gold">{sp.aviso}</Alert>
        </div>
      ) : null}
      <NotaForm clientes={listaClientes} produtos={listaProdutos} formas={FORMAS_PAGAMENTO} iniciais={iniciais} />
    </>
  );
}
