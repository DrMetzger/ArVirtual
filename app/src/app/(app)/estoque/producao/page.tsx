import { and, asc, desc, eq } from "drizzle-orm";
import { Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { filamentos, producoes, produtos, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { capacidadeProducao } from "@/lib/filamentos";
import { formatDate } from "@/lib/utils";
import { ProducaoForm } from "./producao-form";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Produção" };

export default async function ProducaoPage() {
  await requireUser();
  const [listaProdutos, listaFilamentos, historico, capacidade] = await Promise.all([
    db
      .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, filamentoG: produtos.filamentoG, filamentoId: produtos.filamentoId, composicao: produtos.composicao })
      .from(produtos)
      .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false)))
      .orderBy(asc(produtos.nome)),
    db.select().from(filamentos).where(eq(filamentos.ativo, true)).orderBy(asc(filamentos.material), asc(filamentos.cor)),
    db
      .select({ p: producoes, produto: produtos.nome, filamento: filamentos.cor, material: filamentos.material, usuario: usuarios.nome })
      .from(producoes)
      .innerJoin(produtos, eq(produtos.id, producoes.produtoId))
      .leftJoin(filamentos, eq(filamentos.id, producoes.filamentoId))
      .leftJoin(usuarios, eq(usuarios.id, producoes.usuarioId))
      .orderBy(desc(producoes.criadoEm))
      .limit(50),
    capacidadeProducao(),
  ]);

  return (
    <>
      <PageHeader title="Produção" description="Registre o que saiu da impressora: o estoque de peças sobe e o de filamento desce. Abaixo, quanto ainda dá para imprimir." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6">
          <ProducaoForm
            produtos={listaProdutos}
            filamentos={listaFilamentos.map((f) => ({ id: f.id, nome: `${f.material} ${f.cor}${f.marca ? ` (${f.marca})` : ""}`, saldoG: f.saldoG }))}
          />
        </div>
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Quanto dá para imprimir" description="Com o saldo de filamento de hoje, por produto (peça multicor: o filamento que acabar primeiro limita)." />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Filamento</th>
                    <th className="text-right">Em estoque</th>
                    <th className="text-right">Dá para imprimir</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {capacidade.map((c) => (
                    <LinhaLink key={c.id} href={`/produtos/${c.id}`}>
                      <td>
                        <Link href={`/produtos/${c.id}`} className="font-semibold hover:text-gold">
                          {c.nome}
                        </Link>
                        <p className="text-xs text-muted">{c.filamentoG ? `${c.filamentoG} g/peça` : "sem gramas no cadastro"}</p>
                      </td>
                      <td>
                        {c.filamentos.length ? (
                          <span className="grid gap-0.5">
                            {c.filamentos.map((f) => (
                              <span key={f.id} className="flex items-center gap-2 whitespace-nowrap">
                                <span className="size-3 rounded-full border border-border" style={{ background: f.corHex }} />
                                {f.material} {f.cor}
                                {c.filamentos.length > 1 ? <span className="text-xs text-muted">{f.gramas} g</span> : null}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <Link href={`/produtos/${c.id}`} className="text-xs text-gold underline">
                            escolher filamento
                          </Link>
                        )}
                      </td>
                      <td className="text-right">{c.estoque}</td>
                      <td className="text-right text-lg font-extrabold">{c.pecas ?? "—"}</td>
                      <td className="text-right text-muted">{c.horas !== null ? `${c.horas.toFixed(1)} h` : "—"}</td>
                    </LinhaLink>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Últimas produções" />
            {historico.length === 0 ? (
              <EmptyState icon={<Printer />} title="Nenhuma produção registrada" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th className="text-right">Peças</th>
                      <th className="text-right">Filamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(({ p, produto, filamento, material, usuario }) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap text-muted">{formatDate(p.criadoEm)}</td>
                        <td>
                          {produto}
                          {usuario ? <span className="text-xs text-muted"> · {usuario.split(" ")[0]}</span> : null}
                        </td>
                        <td className="text-right font-semibold">{p.quantidade}</td>
                        <td className="text-right text-muted">
                          {p.gramas + p.perdaG} g{filamento ? ` ${material} ${filamento}` : ""}
                          {p.perdaG ? <span className="text-red"> ({p.perdaG} g perda)</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
