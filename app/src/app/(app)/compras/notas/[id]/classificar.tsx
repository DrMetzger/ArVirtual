"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { ItemNotaEntrada } from "@/db/schema";
import { formatBRL } from "@/lib/utils";
import { lancarNota, salvarClassificacao } from "../../actions";

type Opt = { id: string | number; nome: string };

export function Classificar({
  notaId,
  itens,
  parcelas: iniciais,
  editavel,
  filamentos,
  produtos,
}: {
  notaId: number;
  itens: ItemNotaEntrada[];
  parcelas: { vencimento: string; valor: number }[];
  editavel: boolean;
  filamentos: Opt[];
  produtos: Opt[];
}) {
  const [destinos, setDestinos] = useState<Record<number, string>>(Object.fromEntries(itens.map((i) => [i.id, i.destino])));
  const [parcelas, setParcelas] = useState(iniciais.map((p, k) => ({ ...p, k })));
  const [stSalvar, onSalvar, pendSalvar] = useFormAction(salvarClassificacao.bind(null, notaId), null);
  const [stLancar, onLancar, pendLancar] = useFormAction(lancarNota.bind(null, notaId), null);
  const st = stLancar ?? stSalvar;

  return (
    <form onSubmit={(e) => ((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "lancar" ? onLancar(e) : onSalvar(e))} className="grid gap-6">
      <Card>
        <CardHeader title="Itens" description={editavel ? "Diga o que cada item vira: filamento (gramas no estoque), produto (peças) ou despesa." : undefined} />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qtd.</th>
                <th className="text-right">Total</th>
                <th>Vira</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const d = destinos[i.id];
                return (
                  <tr key={i.id}>
                    <td>
                      <p className="font-medium">{i.descricao}</p>
                      <p className="text-xs text-muted">
                        {[i.codigo && `cód. ${i.codigo}`, i.ncm && `NCM ${i.ncm}`, i.cfop && `CFOP ${i.cfop}`].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {i.quantidade.toLocaleString("pt-BR")} {i.unidade}
                    </td>
                    <td className="text-right whitespace-nowrap">{formatBRL(i.valorTotal)}</td>
                    <td className="min-w-72">
                      {editavel ? (
                        <div className="grid gap-2">
                          <Select name={`destino-${i.id}`} value={d} onChange={(e) => setDestinos({ ...destinos, [i.id]: e.target.value })}>
                            <option value="filamento">Filamento</option>
                            <option value="produto">Produto (peças prontas)</option>
                            <option value="despesa">Despesa (só financeiro)</option>
                          </Select>
                          {d === "filamento" ? (
                            <div className="grid grid-cols-[1fr_110px] gap-2">
                              <Select name={`filamento-${i.id}`} defaultValue={i.filamentoId ?? ""} required>
                                <option value="">Qual filamento?</option>
                                {filamentos.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.nome}
                                  </option>
                                ))}
                              </Select>
                              <div className="relative">
                                <Input name={`gramas-${i.id}`} type="number" min={1} defaultValue={i.gramasPorUnidade} title="Gramas por unidade" className="pr-12" />
                                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted">g/un</span>
                              </div>
                            </div>
                          ) : null}
                          {d === "produto" ? (
                            <Select name={`produto-${i.id}`} defaultValue={i.produtoId ?? ""} required>
                              <option value="">Qual produto?</option>
                              {produtos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nome}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </div>
                      ) : (
                        <Badge tone={d === "despesa" ? "neutral" : "green"}>
                          {d === "filamento"
                            ? `${filamentos.find((f) => f.id === i.filamentoId)?.nome ?? "Filamento"} · ${Math.round(i.quantidade * i.gramasPorUnidade)} g`
                            : d === "produto"
                              ? (produtos.find((p) => p.id === i.produtoId)?.nome ?? "Produto")
                              : "Despesa"}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editavel ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            Filamentos novos: cadastre em Estoque › Filamentos. O frete e o desconto da nota entram no custo de cada item, proporcional ao valor.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Parcelas a pagar" description="Vão para o financeiro (contas a pagar)." />
        <div className="grid gap-2 p-5">
          {parcelas.map((p, n) => (
            <div key={p.k} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input type="date" name="parcelaVencimento" defaultValue={p.vencimento} disabled={!editavel} />
              <Input name="parcelaValor" inputMode="decimal" defaultValue={String(p.valor).replace(".", ",")} disabled={!editavel} />
              {editavel ? (
                <button type="button" onClick={() => setParcelas(parcelas.filter((x) => x.k !== p.k))} className="text-muted hover:text-red" aria-label={`Remover parcela ${n + 1}`}>
                  <Trash2 className="size-4" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {editavel ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setParcelas([...parcelas, { vencimento: "", valor: 0, k: Date.now() }])}>
              <Plus /> Parcela
            </Button>
          ) : null}
        </div>
      </Card>

      {st?.erro ? <Alert>{st.erro}</Alert> : null}
      {st?.ok ? <Alert tone="green">{st.ok}</Alert> : null}
      {editavel ? (
        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton pending={pendSalvar} variant="outline" pendingText="Salvando..." value="salvar">
            Salvar classificação
          </SubmitButton>
          <SubmitButton pending={pendLancar} variant="gold" pendingText="Lançando..." value="lancar">
            Lançar nota (dar entrada no estoque)
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
