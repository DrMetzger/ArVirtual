"use client";

import { BuscaSelectCampo } from "@/components/busca-select";
import { useState } from "react";
import { Alert, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { produzir } from "./actions";

type ProdutoOpt = { id: string; sku: string; nome: string; filamentoG: number; filamentoId: number | null };
type FilamentoOpt = { id: number; nome: string; saldoG: number };

export function ProducaoForm({ produtos, filamentos }: { produtos: ProdutoOpt[]; filamentos: FilamentoOpt[] }) {
  const [state, onSubmit, pending] = useFormAction(produzir, null);
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("1");
  const [perda, setPerda] = useState("0");
  const [filamentoId, setFilamentoId] = useState("");
  const p = produtos.find((x) => x.id === produtoId);
  const fil = filamentos.find((f) => String(f.id) === (filamentoId || String(p?.filamentoId ?? "")));
  const gramas = (p?.filamentoG ?? 0) * (Number(qtd) || 0) + (Number(perda) || 0);

  return (
    <Card>
      <CardHeader title="Registrar produção" description="As peças entram no estoque e o filamento usado sai." />
      <form onSubmit={onSubmit} className="grid gap-4 p-5">
        <Field label="Produto">
          <div className="relative">
            <BuscaSelectCampo
              name="produtoId"
              required
              defaultId={produtoId}
              opcoes={produtos.map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.sku }))}
              onChange={(o) => {
                setProdutoId(o?.id ?? "");
                setFilamentoId("");
              }}
              placeholder="Buscar produto por nome ou SKU"
            />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peças boas">
            <Input name="quantidade" type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </Field>
          <Field label="Perda (g)" hint="Falhas, purga, suporte...">
            <Input name="perdaG" type="number" min={0} value={perda} onChange={(e) => setPerda(e.target.value)} />
          </Field>
        </div>
        <Field label="Filamento" hint={p && !p.filamentoId ? "Este produto não tem filamento no cadastro: escolha aqui." : undefined}>
          <Select name="filamentoId" value={filamentoId || String(p?.filamentoId ?? "")} onChange={(e) => setFilamentoId(e.target.value)}>
            <option value="">Sem baixa de filamento</option>
            {filamentos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · {(f.saldoG / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
              </option>
            ))}
          </Select>
        </Field>
        {p ? (
          <p className={gramas > (fil?.saldoG ?? Infinity) ? "text-sm text-red" : "text-sm text-muted"}>
            Vai usar <b>{gramas} g</b> ({p.filamentoG} g × {qtd || 0}
            {Number(perda) ? ` + ${perda} g de perda` : ""}){fil ? ` de ${fil.nome}, que tem ${fil.saldoG} g.` : "."}
          </p>
        ) : null}
        <Field label="Observação">
          <Input name="observacao" placeholder="Opcional" />
        </Field>
        {state?.erro ? <Alert>{state.erro}</Alert> : null}
        {state?.ok ? <Alert tone="green">{state.ok}</Alert> : null}
        <SubmitButton pending={pending} pendingText="Registrando...">
          Registrar produção
        </SubmitButton>
      </form>
    </Card>
  );
}
