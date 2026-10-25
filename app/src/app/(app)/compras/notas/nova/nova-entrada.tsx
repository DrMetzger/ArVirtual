"use client";

import { FileUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { criarNotaManual, importarXml } from "../../actions";

type Linha = { key: number; descricao: string; quantidade: string; valorUnitario: string };

export function NovaEntrada({ fornecedores }: { fornecedores: { id: string; nome: string }[] }) {
  const [stXml, onXml, pendXml] = useFormAction(importarXml, null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState("");
  const [frete, setFrete] = useState("");
  const [desconto, setDesconto] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 1, descricao: "", quantidade: "1", valorUnitario: "" }]);
  const [erro, setErro] = useState("");
  const [salvando, start] = useTransition();
  const at = (k: number, p: Partial<Linha>) => setLinhas((l) => l.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const total = linhas.reduce((s, l) => s + parseDecimal(l.quantidade) * parseDecimal(l.valorUnitario), 0) + parseDecimal(frete) - parseDecimal(desconto);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Importar XML da NF-e" description="Recomendado: o fornecedor é cadastrado e itens, totais e parcelas vêm da nota." />
        <form onSubmit={onXml} className="grid gap-4 p-5">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-sm font-semibold text-muted hover:border-gold hover:text-gold">
            <FileUp className="size-8" />
            Escolher arquivo .xml
            <input type="file" name="xml" accept=".xml,text/xml,application/xml" className="text-xs font-normal" required />
          </label>
          {stXml?.erro ? <Alert>{stXml.erro}</Alert> : null}
          <SubmitButton pending={pendXml} pendingText="Importando...">
            Importar
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <CardHeader title="Digitar nota" description="Para compras sem XML (recibo, nota em papel)." />
        <div className="grid gap-4 p-5">
          <Field label="Fornecedor">
            <div className="flex gap-2">
              <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
              <Link href="/compras/fornecedores/novo" className="self-center text-xs font-semibold whitespace-nowrap text-gold underline">
                Novo
              </Link>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número">
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </Field>
            <Field label="Emissão">
              <Input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
            </Field>
          </div>
          {linhas.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_70px_100px_auto] items-end gap-2">
              <Field label="Item">
                <Input value={l.descricao} onChange={(e) => at(l.key, { descricao: e.target.value })} placeholder="Filamento PLA Preto 1kg" />
              </Field>
              <Field label="Qtd.">
                <Input inputMode="decimal" value={l.quantidade} onChange={(e) => at(l.key, { quantidade: e.target.value })} />
              </Field>
              <Field label="Unit. (R$)">
                <Input inputMode="decimal" value={l.valorUnitario} onChange={(e) => at(l.key, { valorUnitario: e.target.value })} />
              </Field>
              <button type="button" onClick={() => setLinhas((x) => (x.length > 1 ? x.filter((y) => y.key !== l.key) : x))} className="mb-2 text-muted hover:text-red" aria-label="Remover">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((x) => [...x, { key: Date.now(), descricao: "", quantidade: "1", valorUnitario: "" }])}>
            <Plus /> Item
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frete (R$)">
              <Input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </Field>
            <Field label="Desconto (R$)">
              <Input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </Field>
          </div>
          <p className="text-right text-sm font-bold">Total: {formatBRL(total)}</p>
          {erro ? <Alert>{erro}</Alert> : null}
          <Button
            disabled={salvando}
            onClick={() =>
              start(async () => {
                setErro("");
                const r = await criarNotaManual({
                  fornecedorId,
                  numero,
                  emissao,
                  frete: parseDecimal(frete),
                  desconto: parseDecimal(desconto),
                  itens: linhas.filter((l) => l.descricao).map((l) => ({ descricao: l.descricao, quantidade: parseDecimal(l.quantidade), valorUnitario: parseDecimal(l.valorUnitario) })),
                });
                if (r?.erro) setErro(r.erro);
              })
            }
          >
            {salvando ? <Loader2 className="animate-spin" /> : <Save />} Criar nota
          </Button>
        </div>
      </Card>
    </div>
  );
}
