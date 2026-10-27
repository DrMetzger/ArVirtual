import { and, desc, gte, lte } from "drizzle-orm";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosComissoes, afiliadosProdutos } from "@/db/schema";
import { STATUS_COMISSAO } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { sincronizarComissoesAgora } from "../actions";

export const metadata: Metadata = { title: "Comissões de afiliado" };

const dia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export default async function ComissoesPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; ok?: string; erro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const hoje = new Date();
  const de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : `${dia(hoje).slice(0, 8)}01`;
  const ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : dia(hoje);
  const [linhas, produtos] = await Promise.all([
    db
      .select()
      .from(afiliadosComissoes)
      .where(and(gte(afiliadosComissoes.compraEm, new Date(`${de}T00:00:00-03:00`)), lte(afiliadosComissoes.compraEm, new Date(`${ate}T23:59:59-03:00`))))
      .orderBy(desc(afiliadosComissoes.compraEm)),
    db.select({ id: afiliadosProdutos.id, itemId: afiliadosProdutos.itemId }).from(afiliadosProdutos),
  ]);
  const soma = (f: (s: string) => boolean) => linhas.filter((l) => f(l.status)).reduce((t, l) => t + l.comissao, 0);
  const porSub = Object.entries(
    linhas
      .filter((l) => l.status !== "CANCELLED")
      .reduce<Record<string, number>>((acc, l) => ((acc[l.subId || "(sem sub ID)"] = (acc[l.subId || "(sem sub ID)"] ?? 0) + l.comissao), acc), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="Comissões"
        description="Compras feitas pelos seus links de afiliado, com a comissão de cada item. A Shopee guarda os últimos 3 meses."
        actions={
          <Link href="/afiliados" className={buttonClass("outline")}>
            <ArrowLeft /> Afiliados
          </Link>
        }
      />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}

        <Card>
          <form className="flex flex-wrap items-end gap-3 p-5">
            <Field label="Compras de">
              <Input type="date" name="de" defaultValue={de} />
            </Field>
            <Field label="Até">
              <Input type="date" name="ate" defaultValue={ate} />
            </Field>
            <button type="submit" className={buttonClass("outline")}>
              Filtrar
            </button>
            <SubmitButton formAction={sincronizarComissoesAgora} variant="gold" pendingText="Sincronizando..." className="ml-auto">
              <RefreshCw /> Buscar na Shopee
            </SubmitButton>
          </form>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo titulo="Estimada" valor={soma((s) => s !== "CANCELLED")} detalhe="Tudo menos cancelados" destaque />
          <Resumo titulo="Concluída" valor={soma((s) => s === "COMPLETED")} detalhe="Confirmada pela Shopee" />
          <Resumo titulo="Pendente" valor={soma((s) => s === "PENDING" || s === "UNPAID")} detalhe="Aguardando entrega/pagamento" />
          <Resumo titulo="Cancelada" valor={soma((s) => s === "CANCELLED")} detalhe="Não será paga" />
        </div>

        {porSub.length > 1 ? (
          <Card>
            <CardHeader title="Por origem (sub ID)" description="De onde vieram as vendas: use um sub ID diferente em cada rede ou vídeo." />
            <div className="flex flex-wrap gap-2 p-5">
              {porSub.map(([s, v]) => (
                <Badge key={s} tone="gold" className="text-sm">
                  {s}: {formatBRL(v)}
                </Badge>
              ))}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={`${linhas.length} item(ns) no período`} />
          {linhas.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nada no período. Clique em “Buscar na Shopee” para trazer as compras.</p>
          ) : (
            <div className="divide-y divide-border">
              {linhas.map((l) => {
                const st = STATUS_COMISSAO[l.status] ?? { rotulo: l.status, tom: "neutral" as const };
                const meu = produtos.find((p) => p.itemId === l.itemId);
                return (
                  <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                    <span className="w-28 shrink-0 text-muted">{l.compraEm ? formatDate(l.compraEm) : "—"}</span>
                    <span className="min-w-[200px] flex-1">
                      {meu ? (
                        <Link href={`/afiliados/${meu.id}`} className="font-semibold hover:text-gold">
                          {l.itemNome}
                        </Link>
                      ) : (
                        <span className="font-semibold">{l.itemNome}</span>
                      )}
                      <span className="block text-xs text-muted">
                        {l.loja} · pedido {l.orderId}
                        {l.subId ? ` · ${l.subId}` : ""}
                      </span>
                    </span>
                    <span className="text-muted">
                      {l.quantidade} un. · {formatBRL(l.valor)}
                    </span>
                    <Badge tone={st.tom}>{st.rotulo}</Badge>
                    <span className={cn("w-24 text-right font-semibold", l.status === "CANCELLED" ? "text-muted line-through" : "text-green")}>{formatBRL(l.comissao)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Resumo({ titulo, valor, detalhe, destaque }: { titulo: string; valor: number; detalhe: string; destaque?: boolean }) {
  return (
    <Card className={cn("p-5", destaque && "border-gold/50")}>
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">{titulo}</p>
      <p className={cn("mt-2 font-display text-2xl font-extrabold", destaque && "text-gold")}>{formatBRL(valor)}</p>
      <p className="mt-1 text-xs text-muted">{detalhe}</p>
    </Card>
  );
}
