import { chamadaInterna } from "@/lib/interno";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Sincronização automática de pedidos (disparada a cada 15 minutos pelo instrumentation.ts).
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  // Normal: pedidos atualizados nos últimos 2 dias (novos e mudanças de envio/entrega/cancelamento de pedidos antigos).
  // ?completo=1 (primeira rodada depois de subir): histórico de 2 anos por data de compra.
  const completo = new URL(req.url).searchParams.get("completo") === "1";
  const r = completo ? await sincronizarPedidos(730) : await sincronizarPedidos(2, true);
  return Response.json(r);
}
