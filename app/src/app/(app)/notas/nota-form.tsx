"use client";

import { Calculator, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { formatBRL, formatDocumento, parseDecimal } from "@/lib/utils";
import { criarNota, previsualizarNota, type Preview } from "./actions";

type ClienteOpt = {
  id: string;
  nome: string;
  documento: string;
  enderecos: { id: string; apelido: string; cidade: string; uf: string; principal: boolean }[];
};
type ProdutoOpt = { id: string; sku: string; nome: string; preco: number; estoque: number };
type Linha = { key: number; produtoId: string; quantidade: string; valorUnitario: string };

export function NotaForm({
  clientes,
  produtos,
  formas,
}: {
  clientes: ClienteOpt[];
  produtos: ProdutoOpt[];
  formas: readonly (readonly [string, string])[];
}) {
  const [clienteId, setClienteId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("99");
  const [enderecoId, setEnderecoId] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 1, produtoId: "", quantidade: "1", valorUnitario: "" }]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erro, setErro] = useState("");
  const [calculando, startCalc] = useTransition();
  const [salvando, startSave] = useTransition();

  const cliente = clientes.find((c) => c.id === clienteId);
  const entrada = useMemo(
    () => ({
      clienteId,
      enderecoId,
      itens: linhas
        .filter((l) => l.produtoId)
        .map((l) => ({ produtoId: l.produtoId, quantidade: parseDecimal(l.quantidade), valorUnitario: parseDecimal(l.valorUnitario) })),
    }),
    [clienteId, enderecoId, linhas],
  );
  const subtotal = entrada.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  function atualizar(key: number, patch: Partial<Linha>) {
    setPreview(null);
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Destinatário" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Cliente">
            <Select
              value={clienteId}
              onChange={(e) => {
                const c = clientes.find((x) => x.id === e.target.value);
                setClienteId(e.target.value);
                setEnderecoId(c?.enderecos.find((x) => x.principal)?.id ?? c?.enderecos[0]?.id ?? "");
                setPreview(null);
              }}
            >
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {formatDocumento(c.documento)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Endereço de entrega" hint={cliente && !cliente.enderecos.length ? "Cliente sem endereço cadastrado." : undefined}>
            <Select value={enderecoId} onChange={(e) => (setEnderecoId(e.target.value), setPreview(null))} disabled={!cliente}>
              {cliente?.enderecos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.apelido} · {e.cidade}/{e.uf}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              {formas.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Itens"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinhas([...linhas, { key: Date.now(), produtoId: "", quantidade: "1", valorUnitario: "" }])}
            >
              <Plus /> Adicionar item
            </Button>
          }
        />
        <div className="grid gap-3 p-5">
          {linhas.map((l) => (
            <div key={l.key} className="grid gap-3 sm:grid-cols-[1fr_110px_150px_120px_40px] sm:items-end">
              <Field label="Produto">
                <Select
                  value={l.produtoId}
                  onChange={(e) => {
                    const p = produtos.find((x) => x.id === e.target.value);
                    atualizar(l.key, { produtoId: e.target.value, valorUnitario: p ? String(p.preco).replace(".", ",") : "" });
                  }}
                >
                  <option value="">Selecione...</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qtd.">
                <Input inputMode="decimal" value={l.quantidade} onChange={(e) => atualizar(l.key, { quantidade: e.target.value })} />
              </Field>
              <Field label="Valor unit. (R$)">
                <Input inputMode="decimal" value={l.valorUnitario} onChange={(e) => atualizar(l.key, { valorUnitario: e.target.value })} />
              </Field>
              <div className="pb-2.5 text-right text-sm font-semibold">
                {formatBRL(parseDecimal(l.quantidade) * parseDecimal(l.valorUnitario))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hover:text-red"
                disabled={linhas.length === 1}
                onClick={() => (setLinhas(linhas.filter((x) => x.key !== l.key)), setPreview(null))}
                aria-label="Remover item"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex justify-end border-t border-border pt-3 text-sm">
            Subtotal: <strong className="ml-2">{formatBRL(subtotal)}</strong>
          </div>
        </div>
      </Card>

      {preview?.itens?.length ? (
        <Card>
          <CardHeader
            title="Tributação calculada pela matriz fiscal"
            action={<Badge tone={preview.interna ? "blue" : "gold"}>{preview.interna ? "Operação interna" : "Interestadual"}</Badge>}
          />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Regra</th>
                  <th>CFOP</th>
                  <th>ICMS</th>
                  <th>PIS</th>
                  <th>COFINS</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.itens.map((i, idx) => (
                  <tr key={`${i.produtoId}-${idx}`}>
                    <td>
                      <p className="font-semibold">{i.nome}</p>
                      <p className="text-xs text-muted">NCM {i.ncm}</p>
                    </td>
                    <td className="text-xs text-muted">{i.regraNome}</td>
                    <td className="font-mono text-xs">{i.cfop}</td>
                    <td className="text-xs">
                      {i.taxes.icms.cst} · {formatBRL(i.taxes.icms.value)}
                      {i.taxes.difal ? <p className="text-muted">DIFAL {formatBRL(i.taxes.difal.value + i.taxes.difal.fcpValue)}</p> : null}
                    </td>
                    <td className="text-xs">
                      {i.taxes.pis.cst} · {formatBRL(i.taxes.pis.value)}
                    </td>
                    <td className="text-xs">
                      {i.taxes.cofins.cst} · {formatBRL(i.taxes.cofins.value)}
                    </td>
                    <td className="text-right font-semibold">{formatBRL(i.valorBruto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-6 border-t border-border px-5 py-4 text-sm">
            <span>
              Impostos destacados: <strong>{formatBRL(preview.totalImpostos ?? 0)}</strong>
            </span>
            <span className="text-base">
              Total da nota: <strong className="text-gold">{formatBRL(preview.totalNota ?? 0)}</strong>
            </span>
          </div>
        </Card>
      ) : null}

      {preview?.erros?.length ? <Alert>{preview.erros.join(" ")}</Alert> : null}
      {preview?.avisos?.length ? <Alert tone="gold">{preview.avisos.join(" ")}</Alert> : null}
      {preview?.erro || erro ? <Alert>{preview?.erro || erro}</Alert> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="lg"
          disabled={calculando || !entrada.itens.length || !enderecoId}
          onClick={() => startCalc(async () => setPreview(await previsualizarNota(entrada)))}
        >
          {calculando ? <Loader2 className="animate-spin" /> : <Calculator />} Calcular impostos
        </Button>
        <Button
          size="lg"
          disabled={salvando || !preview?.itens?.length || Boolean(preview.erros?.length)}
          onClick={() =>
            startSave(async () => {
              const r = await criarNota({ ...entrada, formaPagamento });
              if (r?.erro) setErro(r.erro);
            })
          }
        >
          {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar rascunho
        </Button>
      </div>
    </div>
  );
}
