import { CANAIS_VENDA } from "@/db/schema";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Aviso do marketplace (ex.: Mercado Livre, tópico "orders_v2"): pedido novo ou alterado.
// Não confia no conteúdo: só antecipa a sincronização normal (a mesma dos 15 minutos), no máximo 1 vez a cada 30 s.
let ultimo = 0;

export async function POST(_: Request, { params }: { params: Promise<{ mp: string }> }) {
  const { mp } = await params;
  if (!CANAIS_VENDA.includes(mp as (typeof CANAIS_VENDA)[number]) || mp === "loja") return new Response(null, { status: 404 });
  if (Date.now() - ultimo > 30_000) {
    ultimo = Date.now();
    void sincronizarPedidos(3, true).catch((e: Error) => console.warn(`[notificação ${mp}] ${e.message}`));
  }
  // O Mercado Livre exige resposta 200 rápida, senão reenvia e pode desativar os avisos.
  return new Response(null, { status: 200 });
}
