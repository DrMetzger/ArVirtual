import { ArrowRight, Eye, Heart, Link2, Percent, Store, Unplug } from "lucide-react";
import Link from "next/link";
import { CANAIS, MarcaIcone } from "@/components/marca";
import { LinhaLink } from "@/components/linha-link";
import { Badge, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui";
import type { ContaMarketplace, Marketplace } from "@/db/schema";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { desconectar } from "./actions";
import type { pedidosRecentes, Resumo } from "./dados";

/** Números dos últimos 30 dias de um marketplace (vendido, taxas, frete, sobra, visualizações). */
export function ResumoMarketplace({ r, abrir }: { r: Resumo; abrir?: boolean }) {
  const m = r.marketplace;
  const pct = r.vendido ? ((r.taxas + r.frete) / r.vendido) * 100 : 0;
  return (
    <div className="grid content-start gap-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <MarcaIcone canal={m} className="size-7" />
        <span className="font-semibold">{CANAIS[m].nome}</span>
        <span className="ml-auto text-xs text-muted">{r.pedidos} pedido(s)</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">Vendido</span>
        <span className="text-right font-semibold">{formatBRL(r.vendido)}</span>
        <span className="text-muted">Taxas</span>
        <span className="text-right font-semibold text-red">{formatBRL(r.taxas)}</span>
        <span className="text-muted">Frete pago por você</span>
        <span className="text-right font-semibold text-red">{formatBRL(r.frete)}</span>
        <span className="text-muted">Sobra (antes do custo)</span>
        <span className="text-right font-bold text-green">{formatBRL(r.vendido - r.taxas - r.frete)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Percent className="size-3.5" /> {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do vendido
        </span>
        {m !== "magalu" ? (
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" /> {r.visitas.toLocaleString("pt-BR")} visualizações
          </span>
        ) : (
          <span>Magalu não informa visualizações</span>
        )}
        {m === "shopee" ? (
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5" /> {r.curtidas.toLocaleString("pt-BR")}
          </span>
        ) : null}
        {r.abertos ? <span className="text-gold">{r.abertos} pedido(s) com taxa ainda em aberto</span> : null}
      </div>
      {abrir ? (
        <Link href={`/marketplaces/${m}`} className={buttonClass("outline", "sm", "mt-1")}>
          Abrir {CANAIS[m].nome} <ArrowRight />
        </Link>
      ) : null}
    </div>
  );
}

/** Contas conectadas de um marketplace, com conectar/desconectar e a URL de retorno do app. */
export function ContasMarketplace({ m, contas, configurado, callback }: { m: Marketplace; contas: ContaMarketplace[]; configurado: boolean; callback: string }) {
  const info = MARKETPLACE_INFO[m];
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="h-1.5" style={{ background: info.cor }} />
      <CardHeader
        title="Contas conectadas"
        description={configurado ? `${contas.length} conta(s) conectada(s)` : "App ainda não configurado"}
        action={<Badge tone={contas.length ? "green" : configurado ? "gold" : "neutral"}>{contas.length ? "Ativo" : configurado ? "Pronto" : "Pendente"}</Badge>}
      />
      <div className="grid flex-1 content-start gap-3 p-5 text-sm">
        {contas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.nome}</p>
              <p className="text-xs text-muted">{c.ultimaSincronizacao ? `Sincronizado ${formatDate(c.ultimaSincronizacao)}` : "Ainda não sincronizado"}</p>
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
        {!configurado ? (
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
          <code className="break-all rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{callback}</code>
          {/* Link comum: a rota responde com redirecionamento para o login do marketplace. */}
          <a href={`/api/marketplaces/${m}/conectar`} className={buttonClass(configurado ? "primary" : "outline", "md", configurado ? "" : "pointer-events-none opacity-50")}>
            <Link2 /> Conectar conta
          </a>
        </div>
      </div>
    </Card>
  );
}

/** Tabela de pedidos recentes (de um marketplace ou de todos). */
export function PedidosRecentes({ pedidos, verTodos, mostrarCanal = true }: { pedidos: Awaited<ReturnType<typeof pedidosRecentes>>; verTodos: string; mostrarCanal?: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Pedidos recentes"
        action={
          <Link href={verTodos} className={buttonClass("outline", "sm")}>
            Ver todos os pedidos
          </Link>
        }
      />
      {pedidos.length === 0 ? (
        <EmptyState icon={<Store />} title="Nenhum pedido importado" description="Conecte uma conta e clique em Sincronizar." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {mostrarCanal ? <th>Marketplace</th> : <th>Conta</th>}
                <th>Pedido</th>
                <th>Comprador</th>
                <th>Data</th>
                <th>Status</th>
                <th className="text-right">Taxas</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <LinhaLink key={p.id} href={`/pedidos/${p.id}`}>
                  <td>
                    {mostrarCanal ? (
                      <>
                        <span className="inline-flex items-center gap-2">
                          <MarcaIcone canal={p.marketplace} />
                          {CANAIS[p.marketplace].nome}
                        </span>
                        <p className="text-xs text-muted">{p.conta}</p>
                      </>
                    ) : (
                      p.conta
                    )}
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
                  <td className={cn("text-right", p.taxas ? "text-red" : "text-muted")}>{p.taxas ? formatBRL(p.taxas) : "—"}</td>
                  <td className="text-right font-semibold">{formatBRL(p.total)}</td>
                </LinhaLink>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
