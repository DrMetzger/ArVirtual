import { CANAIS_VENDA, type Marketplace } from "@/db/schema";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Aviso do marketplace (Mercado Livre "orders_v2"/"shipments", Magalu "orders_order"/"orders_delivery"): pedido novo ou alterado.
// Não confia no conteúdo: só antecipa a sincronização de novidades daquele marketplace, no máximo 1 vez a cada 30 s.
const ultimo = new Map<string, number>();

export async function POST(_: Request, { params }: { params: Promise<{ mp: string }> }) {
  const { mp } = await params;
  if (!CANAIS_VENDA.includes(mp as (typeof CANAIS_VENDA)[number]) || mp === "loja") return new Response(null, { status: 404 });
  if (Date.now() - (ultimo.get(mp) ?? 0) > 30_000) {
    ultimo.set(mp, Date.now());
    void sincronizarPedidos({ tipo: "novidades", marketplace: mp as Marketplace }).catch((e: Error) => console.warn(`[notificação ${mp}] ${e.message}`));
  }
  // O Mercado Livre exige resposta 200 rápida, senão reenvia e pode desativar os avisos.
  return new Response(null, { status: 200 });
}
