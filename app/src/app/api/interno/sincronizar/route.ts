import { chamadaInterna } from "@/lib/interno";
import { afiliadosConfigurado, sincronizarComissoes } from "@/lib/afiliados";
import { sincronizarPedidos } from "@/lib/marketplaces";
import { reenviarNotasPendentes } from "@/lib/marketplaces/enviar-nota";
import { rotinaSentinela } from "@/lib/sentinela";
import { rotinaGarimpo } from "@/lib/garimpo";
import { rotinaContagemAnuncios } from "@/lib/contagem-anuncios";
import { rotinaRaioX } from "@/lib/raiox";
import { rotinaTaxas } from "@/lib/taxas";
import { analisarPendentes } from "@/lib/pesquisa-modelos";
import { concluirPendentes } from "@/lib/publicacoes-pendentes";
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
  // Quantos anúncios cada plataforma enxerga (contados lá, pela API), a cada 6 h.
  void rotinaContagemAnuncios().catch((e: Error) => console.warn(`[contagem-anuncios] ${e.message}`));
  // Raio-X dos anúncios (visitas, vendas, qualidade) a cada 6 h.
  void rotinaRaioX().catch((e: Error) => console.warn(`[raio-x] ${e.message}`));
  void rotinaTaxas().catch((e: Error) => console.warn(`[taxas] ${e.message}`));
  // Pesquisa de modelos 3D que parou no meio (servidor reiniciou): continua de onde estava.
  void analisarPendentes().catch((e: Error) => console.warn(`[pesquisa-modelos] ${e.message}`));
  // Publicações que a plataforma ainda estava criando (Magalu): termina sozinho.
  void concluirPendentes().catch((e: Error) => console.warn(`[publicações pendentes] ${e.message}`));
  return Response.json(r);
}
