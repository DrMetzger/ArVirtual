import { Link2, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SincronizarPedidos } from "@/components/sincronizar-pedidos";
import { Alert, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { contasMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { atualizarMetricasTaxas } from "./actions";
import { PedidosRecentes, ResumoMarketplace } from "./blocos";
import { pedidosRecentes, resumoMarketplaces } from "./dados";

export const metadata: Metadata = { title: "Marketplaces" };

// Visão geral: compara os marketplaces lado a lado. Cada um tem a sua página (menu Marketplaces) com tudo da API dele.
export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser();
  const { ok, erro } = await searchParams;
  const [contas, resumo, pedidos] = await Promise.all([db.select().from(contasMarketplace), resumoMarketplaces(), pedidosRecentes()]);

  return (
    <>
      <PageHeader
        title="Marketplaces"
        description="Visão geral de todos os canais. Cada marketplace tem a sua página no menu, com contas, anúncios, pedidos e métricas."
        actions={
          <>
            {contas.length ? (
              <Link href="/marketplaces/anuncios" className={buttonClass("outline", "md")}>
                <Link2 /> Vincular anúncios
              </Link>
            ) : null}
            <SincronizarPedidos contas={contas.map((c) => ({ id: c.id, nome: c.nome, marketplaceNome: MARKETPLACE_INFO[c.marketplace].nome }))} voltar="/marketplaces" />
          </>
        }
      />
      <div className="grid gap-6">
        {ok ? <Alert tone="green">{ok}</Alert> : null}
        {erro ? <Alert>{erro}</Alert> : null}
        <Card>
          <CardHeader
            title="Taxas e desempenho (últimos 30 dias)"
            description="Taxas (comissão, tarifa fixa, serviço, transação) e frete pago por você, lidos das APIs em cada pedido; visualizações dos anúncios no ar."
            action={
              <form action={atualizarMetricasTaxas.bind(null, "/marketplaces")}>
                <SubmitButton variant="outline" size="sm" pendingText="Atualizando...">
                  <RefreshCw /> Atualizar agora
                </SubmitButton>
              </form>
            }
          />
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            {resumo.map((r) => (
              <ResumoMarketplace key={r.marketplace} r={r} abrir />
            ))}
          </div>
        </Card>
        <PedidosRecentes pedidos={pedidos} verTodos="/pedidos" />
      </div>
    </>
  );
}
