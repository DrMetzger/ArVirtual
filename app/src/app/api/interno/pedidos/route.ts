import { chamadaInterna } from "@/lib/interno";
import { sincronizarPedidos } from "@/lib/marketplaces";

// Busca rápida (a cada 2 min, pelo instrumentation.ts): só pedidos novos ou alterados desde a última rodada de cada conta.
// Pedido novo dispara o aviso para os celulares conectados.
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  const r = await sincronizarPedidos({ tipo: "novidades", rapido: true });
  return Response.json(r);
}
