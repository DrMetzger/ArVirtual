import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Spool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { filamentos, movimentosFilamento, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { capacidadeProducao } from "@/lib/filamentos";
import { cn, formatBRL, formatDate, formatGramas, precoGrama } from "@/lib/utils";
import { FilamentoForm } from "../filamento-form";
import { MovimentarFilamento } from "./movimentar";

export const metadata: Metadata = { title: "Filamento" };

const TIPO = {
  entrada: { nome: "Entrada", tom: "green" },
  consumo: { nome: "Consumo", tom: "gold" },
  ajuste: { nome: "Pesagem", tom: "blue" },
  estorno: { nome: "Estorno", tom: "neutral" },
} as const;

export default async function FilamentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const f = await db.query.filamentos.findFirst({ where: eq(filamentos.id, id) });
  if (!f) notFound();
  const [movs, capacidade] = await Promise.all([
    db
      .select({ m: movimentosFilamento, usuario: usuarios.nome })
      .from(movimentosFilamento)
      .leftJoin(usuarios, eq(usuarios.id, movimentosFilamento.usuarioId))
      .where(eq(movimentosFilamento.filamentoId, id))
      .orderBy(desc(movimentosFilamento.criadoEm), desc(movimentosFilamento.id))
      .limit(500),
    capacidadeProducao().then((l) => l.filter((c) => c.filamentos.some((f) => f.id === id))),
  ]);

  return (
    <>
      <Link href="/estoque/filamentos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Filamentos
      </Link>
      <PageHeader
        title={`${f.material} ${f.cor}`}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="size-4 rounded-full border border-border" style={{ background: f.corHex }} />
            {f.marca || "sem marca"} · {formatGramas(f.saldoG)} · {precoGrama(f.custoKg)} (custo médio)
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Dá para imprimir" description="Produtos que usam este filamento, com o saldo de hoje." />
            {capacidade.length ? (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="text-right">g/peça</th>
                      <th className="text-right">Peças</th>
                      <th className="text-right">Horas de impressão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capacidade.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/produtos/${c.id}`} className="font-semibold hover:text-gold">
                            {c.nome}
                          </Link>
                        </td>
                        <td className="text-right text-muted">{c.filamentoG || "—"}</td>
                        <td className="text-right text-lg font-extrabold">{c.pecas ?? "—"}</td>
                        <td className="text-right text-muted">{c.horas !== null ? `${c.horas.toFixed(1)} h` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">Nenhum produto ligado. No cadastro do produto, escolha este filamento.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Kardex" />
            {movs.length === 0 ? (
              <EmptyState icon={<Spool />} title="Sem movimentações" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th className="text-right">Gramas</th>
                      <th className="text-right">Saldo</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map(({ m, usuario }) => {
                      const nota = m.origem.match(/^nota-entrada:(\d+)$/)?.[1];
                      return (
                        <tr key={m.id}>
                          <td className="whitespace-nowrap text-muted">{formatDate(m.criadoEm)}</td>
                          <td>
                            <Badge tone={TIPO[m.tipo].tom}>{TIPO[m.tipo].nome}</Badge>
                          </td>
                          <td className={cn("text-right font-semibold", m.gramas < 0 ? "text-red" : "text-green")}>
                            {m.gramas > 0 ? `+${m.gramas}` : m.gramas}
                          </td>
                          <td className="text-right font-semibold">{m.saldoG}</td>
                          <td className="text-sm">
                            {nota ? (
                              <Link href={`/compras/notas/${nota}`} className="text-gold underline">
                                {m.observacao}
                              </Link>
                            ) : (
                              m.observacao
                            )}
                            {m.custoKg ? <span className="text-xs text-muted"> · {precoGrama(m.custoKg)}</span> : null}
                            {usuario ? <span className="text-xs text-muted"> · {usuario.split(" ")[0]}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <MovimentarFilamento id={f.id} saldoG={f.saldoG} />
          <FilamentoForm filamento={f} />
        </div>
      </div>
    </>
  );
}
