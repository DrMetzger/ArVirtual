"use client";

import { Calculator, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { BuscaSelect, buscarClientes, opcaoCliente, type ClienteBusca, type Opcao } from "@/components/busca-select";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { formatBRL, formatDocumento, formatValor, parseDecimal } from "@/lib/utils";
import { criarNota, previsualizarNota, type Preview } from "./actions";

type ProdutoOpt = { id: string; sku: string; nome: string; preco: number; estoque: number };
type Linha = { key: number; produtoId: string; quantidade: string; valorUnitario: string };
type Iniciais = {
  pedidoId: number;
  clienteId: string;
  enderecoId: string;
  itens: { produtoId: string; quantidade: number; valorUnitario: number }[];
  frete: number;
  desconto: number;
  totalPedido: number;
};

const decimal = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

export function NotaForm({
  clienteInicial,
  produtos,
  formas,
  iniciais,
}: {
  clienteInicial?: ClienteBusca | null;
  produtos: ProdutoOpt[];
  formas: readonly (readonly [string, string])[];
  iniciais?: Iniciais;
}) {
  const [clienteSel, setClienteSel] = useState<Opcao<ClienteBusca> | null>(clienteInicial ? opcaoCliente(clienteInicial, formatDocumento) : null);
  const clienteId = clienteSel?.id ?? "";
  const opcoesProduto = produtos.map((p) => ({ id: p.id, titulo: p.nome, detalhe: `${p.sku} · ${formatBRL(p.preco)} · ${p.estoque} em estoque`, dados: p }));
  const [formaPagamento, setFormaPagamento] = useState("99");
  const [enderecoId, setEnderecoId] = useState(iniciais?.enderecoId ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    iniciais?.itens.length
      ? iniciais.itens.map((i, n) => ({ key: n + 1, produtoId: i.produtoId, quantidade: decimal(i.quantidade), valorUnitario: formatValor(i.valorUnitario) }))
      : [{ key: 1, produtoId: "", quantidade: "1", valorUnitario: "" }],
  );
  const [frete, setFrete] = useState(iniciais?.frete ? formatValor(iniciais.frete) : "");
  const [desconto, setDesconto] = useState(iniciais?.desconto ? formatValor(iniciais.desconto) : "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erro, setErro] = useState("");
  const [calculando, startCalc] = useTransition();
  const [salvando, startSave] = useTransition();

  const cliente = clienteSel?.dados;
  const entrada = useMemo(
    () => ({
      clienteId,
      enderecoId,
      itens: linhas
        .filter((l) => l.produtoId)
        .map((l) => ({ produtoId: l.produtoId, quantidade: parseDecimal(l.quantidade), valorUnitario: parseDecimal(l.valorUnitario) })),
      frete: parseDecimal(frete),
      desconto: parseDecimal(desconto),
    }),
    [clienteId, enderecoId, linhas, frete, desconto],
  );
  const subtotal = entrada.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totalVenda = Math.round((subtotal + entrada.frete - entrada.desconto) * 100) / 100;
  const diferenca = iniciais ? Math.round((totalVenda - iniciais.totalPedido) * 100) / 100 : 0;

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
            <BuscaSelect
              valor={clienteSel}
              onChange={(o) => {
                const c = o?.dados;
                setClienteSel(o);
                setEnderecoId(c?.enderecos.find((x) => x.principal)?.id ?? c?.enderecos[0]?.id ?? "");
                setPreview(null);
              }}
              buscar={(q) => buscarClientes(q, formatDocumento)}
              placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone"
            />
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
                <BuscaSelect
                  valor={opcoesProduto.find((o) => o.id === l.produtoId) ?? null}
                  opcoes={opcoesProduto}
                  onChange={(o) => atualizar(l.key, { produtoId: o?.id ?? "", valorUnitario: o?.dados ? formatValor(o.dados.preco) : "" })}
                  placeholder="Buscar produto por nome ou SKU"
                />
              </Field>
              <Field label="Qtd.">
                <Input inputMode="decimal" value={l.quantidade} onChange={(e) => atualizar(l.key, { quantidade: e.target.value })} />
              </Field>
              <Field label="Valor unit. (R$)">
                <Input
                  inputMode="decimal"
                  value={l.valorUnitario}
                  onChange={(e) => atualizar(l.key, { valorUnitario: e.target.value })}
                  onBlur={() => l.valorUnitario.trim() && atualizar(l.key, { valorUnitario: formatValor(parseDecimal(l.valorUnitario)) })}
                />
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
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_150px_150px] sm:items-end">
            <p className="text-sm">
              Produtos: <strong>{formatBRL(subtotal)}</strong>
            </p>
            <Field label="Frete cobrado (R$)" hint="Pago pelo comprador">
              <Input
                inputMode="decimal"
                value={frete}
                placeholder="0,00"
                onChange={(e) => (setFrete(e.target.value), setPreview(null))}
                onBlur={() => frete.trim() && setFrete(formatValor(parseDecimal(frete)))}
              />
            </Field>
            <Field label="Desconto (R$)" hint="Cupom da venda">
              <Input
                inputMode="decimal"
                value={desconto}
                placeholder="0,00"
                onChange={(e) => (setDesconto(e.target.value), setPreview(null))}
                onBlur={() => desconto.trim() && setDesconto(formatValor(parseDecimal(desconto)))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
            {iniciais ? (
              Math.abs(diferenca) < 0.01 ? (
                <Badge tone="green">Igual ao valor pago no pedido</Badge>
              ) : (
                <Badge tone="red">
                  {diferenca > 0 ? "Acima" : "Abaixo"} do pedido em {formatBRL(Math.abs(diferenca))} (pedido: {formatBRL(iniciais.totalPedido)})
                </Badge>
              )
            ) : null}
            <span>
              Total da venda: <strong className="text-base">{formatBRL(totalVenda)}</strong>
            </span>
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
              const r = await criarNota({ ...entrada, formaPagamento, pedidoId: iniciais?.pedidoId });
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
