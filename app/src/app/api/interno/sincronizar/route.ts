import { chamadaInterna } from "@/lib/interno";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Sincronização automática de pedidos (disparada a cada 15 minutos pelo instrumentation.ts).
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  const r = await sincronizarPedidos(7);
  return Response.json(r);
}
