import { and, asc, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { clientes, contasCaixa, fornecedores, lancamentos } from "@/db/schema";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { cancelarLancamento, estornarBaixa, reabrirLancamento } from "./actions";
import { Baixar } from "./linha-titulo";

const FILTROS = [
  ["abertos", "Em aberto"],
  ["vencidos", "Vencidos"],
  ["pagos", "Baixados"],
  ["cancelados", "Cancelados"],
  ["todos", "Todos"],
] as const;

function linkOrigem(origem: string) {
  const [tipo, id] = origem.split(":");
  if (tipo === "pedido") return `/pedidos/${id}`;
  if (tipo === "nota-entrada") return `/compras/notas/${id}`;
  return null;
}

export async function ListaTitulos({ tipo, f = "abertos", q = "" }: { tipo: "receber" | "pagar"; f?: string; q?: string }) {
  const agora = new Date();
  const filtros: SQL[] = [eq(lancamentos.tipo, tipo)];
  if (f === "abertos") filtros.push(eq(lancamentos.status, "aberto"));
  if (f === "vencidos") filtros.push(eq(lancamentos.status, "aberto"), lt(lancamentos.vencimento, new Date(agora.getTime() - 12 * 3600_000)));
  if (f === "pagos") filtros.push(eq(lancamentos.status, "pago"));
  if (f === "cancelados") filtros.push(eq(lancamentos.status, "cancelado"));
  if (q) filtros.push(or(ilike(lancamentos.descricao, `%${q}%`), ilike(lancamentos.categoria, `%${q}%`))!);

  const [lista, contas, totais] = await Promise.all([
    db
      .select({ l: lancamentos, cliente: clientes.nome, fornecedor: fornecedores.nome, conta: contasCaixa.nome })
      .from(lancamentos)
      .leftJoin(clientes, eq(clientes.id, lancamentos.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, lancamentos.fornecedorId))
      .leftJoin(contasCaixa, eq(contasCaixa.id, lancamentos.contaCaixaId))
      .where(and(...filtros))
      .orderBy(f === "pagos" ? desc(lancamentos.pagoEm) : asc(lancamentos.vencimento))
      .limit(500),
    db.select({ id: contasCaixa.id, nome: contasCaixa.nome }).from(contasCaixa).where(eq(contasCaixa.ativo, true)).orderBy(asc(contasCaixa.id)),
    db.select().from(lancamentos).where(and(eq(lancamentos.tipo, tipo), eq(lancamentos.status, "aberto"))),
  ]);
  const vencido = (d: Date) => d.getTime() < agora.getTime() - 12 * 3600_000;
  const emAberto = totais.reduce((s, l) => s + l.valor, 0);
  const vencidos = totais.filter((l) => vencido(l.vencimento));
  const em30 = totais.filter((l) => !vencido(l.vencimento) && l.vencimento < new Date(agora.getTime() + 30 * 86400_000));
  const nome = tipo === "receber" ? "Contas a receber" : "Contas a pagar";

  return (
    <>
      <PageHeader
        title={nome}
        description={tipo === "receber" ? "Vendas pagas entram aqui sozinhas (marketplace: até o repasse; loja: já recebidas)." : "Parcelas das notas de entrada entram aqui sozinhas. Lance também as despesas fixas."}
        actions={
          <Link href={`/financeiro/novo?tipo=${tipo}`} className={buttonClass()}>
            <Plus /> Novo lançamento
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Em aberto", emAberto, `${totais.length} título(s)`, false],
          ["Vencidos", vencidos.reduce((s, l) => s + l.valor, 0), `${vencidos.length} título(s)`, vencidos.length > 0],
          ["Próximos 30 dias", em30.reduce((s, l) => s + l.valor, 0), `${em30.length} título(s)`, false],
        ].map(([t, v, d, alerta]) => (
          <Card key={t as string} className={cn("p-5", alerta && "border-red/40")}>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">{t as string}</p>
            <p className={cn("mt-2 font-display text-2xl font-extrabold", alerta && "text-red")}>{formatBRL(v as number)}</p>
            <p className="mt-1 text-xs text-muted">{d as string}</p>
          </Card>
        ))}
      </div>
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border p-4">
          <Input name="q" defaultValue={q} placeholder="Buscar descrição ou categoria" className="min-w-60 flex-1" />
          <input type="hidden" name="f" value={f} />
          {FILTROS.map(([v, n]) => (
            <Link
              key={v}
              href={`/financeiro/${tipo}?f=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("flex h-10 items-center rounded-xl border px-3 text-sm font-semibold", f === v ? "border-gold text-gold" : "border-border text-muted hover:text-foreground")}
            >
              {n}
            </Link>
          ))}
        </form>
        {lista.length === 0 ? (
          <EmptyState icon={<Wallet />} title="Nada por aqui" description="Nenhum título com esse filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th className="text-right"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ l, cliente, fornecedor, conta }) => {
                  const link = linkOrigem(l.origem);
                  const atrasado = l.status === "aberto" && vencido(l.vencimento);
                  return (
                    <tr key={l.id} className={l.status === "cancelado" ? "opacity-50" : ""}>
                      <td className={cn("whitespace-nowrap", atrasado ? "font-semibold text-red" : "text-muted")}>{formatDate(l.vencimento).slice(0, 10)}</td>
                      <td>
                        {link ? (
                          <Link href={link} className="font-semibold hover:text-gold">
                            {l.descricao}
                          </Link>
                        ) : (
                          <span className="font-semibold">{l.descricao}</span>
                        )}
                        {l.parcela ? <span className="ml-1 text-xs text-muted">({l.parcela})</span> : null}
                        <p className="text-xs text-muted">{[cliente, fornecedor, l.observacoes].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="text-muted">{l.categoria || "—"}</td>
                      <td className="text-right font-semibold whitespace-nowrap">
                        {formatBRL(l.valor)}
                        {l.status === "pago" && l.valorPago !== null && l.valorPago !== l.valor ? (
                          <p className="text-xs font-normal text-muted">baixado {formatBRL(l.valorPago)}</p>
                        ) : null}
                      </td>
                      <td>
                        {l.status === "pago" ? (
                          <Badge tone="green">
                            {tipo === "receber" ? "Recebido" : "Pago"} {l.pagoEm ? formatDate(l.pagoEm).slice(0, 5) : ""}
                            {conta ? ` · ${conta}` : ""}
                          </Badge>
                        ) : l.status === "cancelado" ? (
                          <Badge tone="neutral">Cancelado</Badge>
                        ) : (
                          <Badge tone={atrasado ? "red" : "gold"}>{atrasado ? "Vencido" : "Em aberto"}</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {l.status === "aberto" ? (
                            <>
                              <Baixar id={l.id} valor={l.valor} tipo={tipo} contas={contas} />
                              <form action={cancelarLancamento.bind(null, l.id)}>
                                <SubmitButton size="sm" variant="ghost" pendingText="...">
                                  Cancelar
                                </SubmitButton>
                              </form>
                            </>
                          ) : l.status === "pago" ? (
                            <form action={estornarBaixa.bind(null, l.id)}>
                              <SubmitButton size="sm" variant="ghost" pendingText="...">
                                Estornar baixa
                              </SubmitButton>
                            </form>
                          ) : (
                            <form action={reabrirLancamento.bind(null, l.id)}>
                              <SubmitButton size="sm" variant="ghost" pendingText="...">
                                Reabrir
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
