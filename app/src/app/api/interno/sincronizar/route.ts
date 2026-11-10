import { chamadaInterna } from "@/lib/interno";
import { afiliadosConfigurado, sincronizarComissoes } from "@/lib/afiliados";
import { sincronizarPedidos } from "@/lib/marketplaces";
import { reenviarNotasPendentes } from "@/lib/marketplaces/enviar-nota";
import { rotinaSentinela } from "@/lib/sentinela";
import { rotinaGarimpo } from "@/lib/garimpo";
import { atualizarMetricas, atualizarTaxas, conferirAnuncios } from "@/lib/metricas";

let ultimaComissoes = 0;
let ultimasMetricas = 0;

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
  // Taxas dos pedidos (as da Shopee só fecham com o pedido concluído) e, a cada 3 horas, visualizações dos anúncios.
  // Nota autorizada que o Magalu não aceitou antes (fora do ar, token vencido): tenta de novo.
  void reenviarNotasPendentes().catch((e: Error) => console.warn(`[nota-marketplace] ${e.message}`));
  void atualizarTaxas().catch((e: Error) => console.warn(`[taxas] ${e.message}`));
  if (Date.now() - ultimasMetricas > 3 * 3600_000) {
    ultimasMetricas = Date.now();
    // Antes das visualizações: anúncio excluído no marketplace deixa de contar.
    void conferirAnuncios()
      .then(() => atualizarMetricas())
      .catch((e: Error) => console.warn(`[metricas] ${e.message}`));
  }
  // Sentinela de mercado: coleta a cada 4 h (o controle de intervalo fica na própria rotina).
  void rotinaSentinela().catch((e: Error) => console.warn(`[sentinela] ${e.message}`));
  // Garimpo de afiliados (Shopee), separado do sentinela.
  void rotinaGarimpo().catch((e: Error) => console.warn(`[garimpo] ${e.message}`));
  return Response.json(r);
}
