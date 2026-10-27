import { chamadaInterna } from "@/lib/interno";
import { afiliadosConfigurado, sincronizarComissoes } from "@/lib/afiliados";
import { sincronizarPedidos } from "@/lib/marketplaces";

let ultimaComissoes = 0;

// Sincronização automática de pedidos (disparada a cada 15 minutos pelo instrumentation.ts).
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  // Só o que mudou desde a última rodada de cada conta (pedidos novos e mudanças de envio/entrega/cancelamento).
  const r = await sincronizarPedidos({ tipo: "novidades" });
  // Comissões de afiliado a cada 6 horas: compras dos últimos 45 dias (o status muda até a entrega ser confirmada).
  if (Date.now() - ultimaComissoes > 6 * 3600_000 && (await afiliadosConfigurado())) {
    ultimaComissoes = Date.now();
    void sincronizarComissoes(new Date(Date.now() - 45 * 86400_000)).catch((e: Error) => console.warn(`[afiliados] ${e.message}`));
  }
  return Response.json(r);
}
