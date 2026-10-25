"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { BuscaSelect, buscarClientes, type ClienteBusca, type Opcao } from "@/components/busca-select";
import { MarcaLogo } from "@/components/marca";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, formatBRL, formatDocumento, formatValor, parseDecimal } from "@/lib/utils";
import { criarPedidoManual } from "../actions";

type ProdutoOpt = { id: string; sku: string; nome: string; preco: number; estoque: number };
type Linha = { key: number; produtoId: string; quantidade: string; valorUnitario: string };

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmt = (n: number) => formatValor(n);

export function PedidoForm({ produtos }: { produtos: ProdutoOpt[] }) {
  const [cliente, setCliente] = useState<Opcao<ClienteBusca> | null>(null);
  const clienteId = cliente?.id ?? "";
  const opcoesProduto = produtos.map((x) => ({ id: x.id, titulo: x.nome, detalhe: `${x.sku} · ${formatBRL(x.preco)} · ${x.estoque} em estoque`, dados: x }));
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 1, produtoId: "", quantidade: "1", valorUnitario: "" }]);
  const [desconto, setDesconto] = useState("");
  const [frete, setFrete] = useState("");
  const [situacao, setSituacao] = useState<"aguardando" | "pago" | "enviado" | "entregue">("pago");
  const [data, setData] = useState(hoje());
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, start] = useTransition();

  const itens = linhas
    .filter((l) => l.produtoId)
    .map((l) => ({ produtoId: l.produtoId, quantidade: Math.round(parseDecimal(l.quantidade)), valorUnitario: parseDecimal(l.valorUnitario) }));
  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const total = subtotal - parseDecimal(desconto) + parseDecimal(frete);
  const atualizar = (key: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid content-start gap-6 lg:col-span-2">
        <Card>
          <CardHeader title="Cliente" description="Opcional para venda no balcão. Para emitir NF-e, o cliente precisa estar cadastrado." action={<MarcaLogo canal="loja" className="h-8" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
            <Field label="Cliente">
              <BuscaSelect
                valor={cliente}
                onChange={setCliente}
                buscar={(q) => buscarClientes(q, formatDocumento)}
                vazio="Consumidor final (sem cadastro)"
                placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone"
              />
            </Field>
            <Link href="/clientes/novo" className="self-end text-sm font-semibold text-gold underline sm:pb-2.5">
              Cadastrar cliente
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Itens"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, { key: Date.now(), produtoId: "", quantidade: "1", valorUnitario: "" }])}>
                <Plus /> Adicionar item
              </Button>
            }
          />
          <div className="grid gap-3 p-5">
            {linhas.map((l) => {
              const p = produtos.find((x) => x.id === l.produtoId);
              const qtd = Math.round(parseDecimal(l.quantidade));
              return (
                <div key={l.key} className="grid items-end gap-3 sm:grid-cols-[1fr_90px_130px_110px_auto]">
                  <Field label="Produto" hint={p ? `${p.estoque} em estoque` : undefined}>
                    <BuscaSelect
                      valor={opcoesProduto.find((o) => o.id === l.produtoId) ?? null}
                      opcoes={opcoesProduto}
                      onChange={(o) => atualizar(l.key, { produtoId: o?.id ?? "", valorUnitario: o?.dados ? fmt(o.dados.preco) : "" })}
                      placeholder="Buscar produto por nome ou SKU"
                    />
                  </Field>
                  <Field label="Qtd.">
                    <Input inputMode="numeric" value={l.quantidade} onChange={(e) => atualizar(l.key, { quantidade: e.target.value })} />
                  </Field>
                  <Field label="Valor unit. (R$)">
                    <Input
                      inputMode="decimal"
                      value={l.valorUnitario}
                      onChange={(e) => atualizar(l.key, { valorUnitario: e.target.value })}
                      onBlur={() => l.valorUnitario.trim() && atualizar(l.key, { valorUnitario: fmt(parseDecimal(l.valorUnitario)) })}
                    />
                  </Field>
                  <div className="pb-2.5 text-right text-sm font-semibold">
                    {formatBRL(qtd * parseDecimal(l.valorUnitario))}
                    {p && qtd > p.estoque ? <p className="text-xs font-normal text-red">estoque insuficiente</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                    className="mb-2 grid size-8 place-items-center rounded-lg text-muted hover:text-red"
                    aria-label="Remover item"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Observações" />
          <div className="p-5">
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Ex.: retirar na loja, cor personalizada, prazo combinado..." />
          </div>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Resumo" />
          <div className="grid gap-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </Field>
              <Field label="Situação">
                <Select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
                  <option value="aguardando">Aguardando pagamento</option>
                  <option value="pago">Pago (a enviar)</option>
                  <option value="enviado">Enviado</option>
                  <option value="entregue">Entregue</option>
                </Select>
              </Field>
              <Field label="Desconto (R$)">
                <Input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
              </Field>
              <Field label="Frete (R$)">
                <Input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} />
              </Field>
            </div>
            <dl className="grid gap-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted">
                <dt>Produtos</dt>
                <dd>{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Desconto</dt>
                <dd>− {formatBRL(parseDecimal(desconto))}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Frete</dt>
                <dd>{formatBRL(parseDecimal(frete))}</dd>
              </div>
              <div className={cn("flex justify-between text-base font-bold", total < 0 && "text-red")}>
                <dt>Total</dt>
                <dd>{formatBRL(total)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">Pedidos pagos, enviados ou entregues saem do estoque na hora; cancelados voltam.</p>
          </div>
        </Card>
        {erro ? <Alert>{erro}</Alert> : null}
        <Button
          size="lg"
          disabled={salvando || !itens.length}
          onClick={() =>
            start(async () => {
              setErro("");
              const r = await criarPedidoManual({
                clienteId: clienteId || undefined,
                itens,
                desconto: parseDecimal(desconto),
                frete: parseDecimal(frete),
                situacao,
                data,
                observacoes,
              });
              if (r?.erro) setErro(r.erro);
            })
          }
        >
          {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar pedido
        </Button>
      </div>
    </div>
  );
}
