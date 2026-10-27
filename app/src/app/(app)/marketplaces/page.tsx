import { desc, eq } from "drizzle-orm";
import { CANAIS, MarcaIcone, MarcaLogo } from "@/components/marca";
import { Link2, Store, Unplug } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { contasMarketplace, MARKETPLACES, pedidosMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ADAPTERS, callbackUrl, MARKETPLACE_INFO } from "@/lib/marketplaces";
import { formatBRL, formatDate } from "@/lib/utils";
import { desconectar } from "./actions";
import { SincronizarPedidos } from "@/components/sincronizar-pedidos";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Marketplaces" };

export default async function MarketplacesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser();
  const { ok, erro } = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const [contas, pedidos, configurados] = await Promise.all([
    db.select().from(contasMarketplace),
    db
      .select({
        id: pedidosMarketplace.id,
        marketplace: pedidosMarketplace.marketplace,
        idExterno: pedidosMarketplace.idExterno,
        status: pedidosMarketplace.status,
        total: pedidosMarketplace.total,
        comprador: pedidosMarketplace.comprador,
        data: pedidosMarketplace.data,
        conta: contasMarketplace.nome,
      })
      .from(pedidosMarketplace)
      .innerJoin(contasMarketplace, eq(contasMarketplace.id, pedidosMarketplace.contaId))
      .orderBy(desc(pedidosMarketplace.data))
      .limit(10),
    Promise.all(MARKETPLACES.map(async (m) => [m, await ADAPTERS[m].configurado()] as const)),
  ]);
  const cfg = Object.fromEntries(configurados);

  return (
    <>
      <PageHeader
        title="Marketplaces"
        description="Conecte suas lojas para anunciar o catálogo e acompanhar os pedidos no dashboard."
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

        <div className="grid gap-6 lg:grid-cols-3">
          {MARKETPLACES.map((m) => {
            const info = MARKETPLACE_INFO[m];
            const minhas = contas.filter((c) => c.marketplace === m);
            return (
              <Card key={m} className="flex flex-col overflow-hidden">
                <div className="h-1.5" style={{ background: info.cor }} />
                <CardHeader
                  title={<MarcaLogo canal={m} className="h-8" />}
                  description={cfg[m] ? `${minhas.length} conta(s) conectada(s)` : "App ainda não configurado"}
                  action={<Badge tone={minhas.length ? "green" : cfg[m] ? "gold" : "neutral"}>{minhas.length ? "Ativo" : cfg[m] ? "Pronto" : "Pendente"}</Badge>}
                />
                <div className="grid flex-1 content-start gap-3 p-5 text-sm">
                  {minhas.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.nome}</p>
                        <p className="text-xs text-muted">
                          {c.ultimaSincronizacao ? `Sincronizado ${formatDate(c.ultimaSincronizacao)}` : "Ainda não sincronizado"}
                        </p>
                      </div>
                      <Link href={`/marketplaces/anuncios?conta=${c.id}`} className={buttonClass("ghost", "icon", "hover:text-gold")} title="Vincular anúncios desta conta">
                        <Link2 />
                      </Link>
                      <form action={desconectar.bind(null, c.id)}>
                        <button type="submit" className={buttonClass("ghost", "icon", "hover:text-red")} title="Desconectar">
                          <Unplug />
                        </button>
                      </form>
                    </div>
                  ))}
                  {!cfg[m] ? (
                    <p className="text-muted">
                      Crie um app no{" "}
                      <a href={info.portal} target="_blank" rel="noreferrer" className="font-semibold text-gold underline">
                        portal de desenvolvedores
                      </a>{" "}
                      e cadastre as credenciais em{" "}
                      <Link href="/configuracoes?aba=integracoes" className="font-semibold underline">
                        Configurações
                      </Link>
                      .
                    </p>
                  ) : null}
                  <div className="mt-auto grid gap-2 pt-2">
                    <p className="text-xs text-muted">URL de retorno (redirect URI) para cadastrar no app:</p>
                    <code className="break-all rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{callbackUrl(origin, m)}</code>
                    {/* Link comum: a rota responde com redirecionamento para o login do marketplace. */}
                    <a
                      href={`/api/marketplaces/${m}/conectar`}
                      className={buttonClass(cfg[m] ? "primary" : "outline", "md", cfg[m] ? "" : "pointer-events-none opacity-50")}
                    >
                      <Link2 /> Conectar conta
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader
            title="Pedidos recentes"
            description="Últimos pedidos importados das contas conectadas."
            action={
              <Link href="/pedidos" className={buttonClass("outline", "sm")}>
                Ver todos os pedidos
              </Link>
            }
          />
          {pedidos.length === 0 ? (
            <EmptyState icon={<Store />} title="Nenhum pedido importado" description="Conecte uma conta e clique em Sincronizar pedidos." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Marketplace</th>
                    <th>Pedido</th>
                    <th>Comprador</th>
                    <th>Data</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <LinhaLink key={p.id} href={`/pedidos/${p.id}`}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <MarcaIcone canal={p.marketplace} />
                          {CANAIS[p.marketplace].nome}
                        </span>
                        <p className="text-xs text-muted">{p.conta}</p>
                      </td>
                      <td>
                        <Link href={`/pedidos/${p.id}`} className="font-mono text-xs font-semibold hover:text-gold">
                          {p.idExterno}
                        </Link>
                      </td>
                      <td>{p.comprador || "—"}</td>
                      <td className="text-muted">{formatDate(p.data)}</td>
                      <td>
                        <Badge>{p.status}</Badge>
                      </td>
                      <td className="text-right font-semibold">{formatBRL(p.total)}</td>
                    </LinhaLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
