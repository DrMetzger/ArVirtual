import { and, asc, eq } from "drizzle-orm";
import { CANAIS } from "@/components/marca";
import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { pedidosMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { FORMAS_PAGAMENTO } from "@/lib/nfe/emissor";
import { clienteDoPedido, vincularItens } from "@/lib/pedidos";
import { NotaForm } from "../nota-form";

export const metadata: Metadata = { title: "Nova nota fiscal" };

export default async function NovaNotaPage({ searchParams }: { searchParams: Promise<{ pedido?: string; aviso?: string; endereco?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const pedido = sp.pedido ? await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, Number(sp.pedido) || 0) }) : undefined;
  const listaProdutos = await db
    .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, preco: produtos.preco, estoque: produtos.estoque })
    .from(produtos)
    .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false)))
    .orderBy(asc(produtos.nome));

  // Nota a partir de um pedido de marketplace: comprador, endereço e itens já preenchidos.
  let iniciais;
  let clienteInicial = null;
  if (pedido) {
    const [cliente, itens] = await Promise.all([clienteDoPedido(pedido), vincularItens(pedido)]);
    clienteInicial = cliente
      ? { id: cliente.id, nome: cliente.nome, documento: cliente.documento, email: cliente.email, enderecos: cliente.enderecos.map((e) => ({ id: e.id, apelido: e.apelido, cidade: e.cidade, uf: e.uf, principal: e.principal })) }
      : null;
    iniciais = {
      pedidoId: pedido.id,
      clienteId: cliente?.id ?? "",
      // Endereço de entrega do pedido (garantido no cadastro ao clicar Emitir NF-e).
      enderecoId:
        (sp.endereco && cliente?.enderecos.some((e) => e.id === sp.endereco) ? sp.endereco : undefined) ??
        cliente?.enderecos.find((e) => e.principal)?.id ??
        cliente?.enderecos[0]?.id ??
        "",
      itens: itens.map((i) => ({ produtoId: i.produto?.id ?? "", quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
      // A nota fecha com o que o comprador pagou: produtos + frete cobrado dele − desconto/cupom.
      // O marketplace não manda o desconto separado: é a diferença entre itens + frete e o total pago.
      frete: pedido.frete,
      desconto:
        pedido.desconto ||
        Math.max(0, Math.round((pedido.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) + pedido.frete - pedido.total) * 100) / 100),
      totalPedido: pedido.total,
    };
  }
  return (
    <>
      <PageHeader
        title="Nova nota fiscal"
        description={
          pedido
            ? `Pedido ${pedido.idExterno} do ${CANAIS[pedido.marketplace].nome}: confira e salve; a emissão vai direto para a SEFAZ.`
            : "Monte a nota, confira os impostos e salve como rascunho; a emissão vai direto para a SEFAZ."
        }
      />
      {sp.aviso ? (
        <div className="mb-6">
          <Alert tone="gold">{sp.aviso}</Alert>
        </div>
      ) : null}
      <NotaForm clienteInicial={clienteInicial} produtos={listaProdutos} formas={FORMAS_PAGAMENTO} iniciais={iniciais} />
    </>
  );
}
