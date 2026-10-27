import { chamadaInterna } from "@/lib/interno";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Sincronização automática de pedidos (disparada a cada 15 minutos pelo instrumentation.ts).
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  // Só o que mudou desde a última rodada de cada conta (pedidos novos e mudanças de envio/entrega/cancelamento).
  const r = await sincronizarPedidos({ tipo: "novidades" });
  return Response.json(r);
}
