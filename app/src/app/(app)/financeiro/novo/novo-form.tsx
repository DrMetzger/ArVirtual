"use client";

import { useState } from "react";
import { Alert, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { criarLancamento } from "../actions";

const CATEGORIAS = {
  pagar: ["Compras", "Filamento", "Embalagens", "Energia", "Internet", "Aluguel", "Impostos", "Taxas marketplace", "Frete", "Manutenção", "Pró-labore", "Outros"],
  receber: ["Vendas loja", "Serviço de impressão", "Outros"],
};

export function NovoLancamento({ tipo: inicial, contas }: { tipo: "receber" | "pagar"; contas: { id: number; nome: string }[] }) {
  const [tipo, setTipo] = useState(inicial);
  const [pago, setPago] = useState(false);
  const [state, onSubmit, pending] = useFormAction(criarLancamento, null);
  return (
    <Card className="max-w-2xl">
      <CardHeader title={tipo === "receber" ? "Nova receita" : "Nova despesa"} />
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Tipo">
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="pagar">A pagar (despesa)</option>
            <option value="receber">A receber (receita)</option>
          </Select>
        </Field>
        <Field label="Categoria">
          <Input name="categoria" list="categorias" placeholder="Escolha ou digite" />
          <datalist id="categorias">
            {CATEGORIAS[tipo].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <Input name="descricao" placeholder={tipo === "pagar" ? "Conta de energia de outubro" : "Impressão sob encomenda"} required />
        </Field>
        <Field label="Valor (R$)">
          <Input name="valor" inputMode="decimal" required />
        </Field>
        <Field label="Vencimento">
          <Input name="vencimento" type="date" required />
        </Field>
        <Field label="Repetir" hint="Mensal: cria uma parcela por mês.">
          <Select name="parcelas" defaultValue="1">
            {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Não repetir" : `${n} meses`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid content-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pago" checked={pago} onChange={(e) => setPago(e.target.checked)} className="size-4 accent-[var(--gold)]" />
            Já {tipo === "receber" ? "recebido" : "pago"}
          </label>
          {pago ? (
            <Select name="conta">
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea name="observacoes" rows={2} />
        </Field>
        {state?.erro ? (
          <div className="sm:col-span-2">
            <Alert>{state.erro}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <SubmitButton pending={pending} pendingText="Salvando...">
            Salvar lançamento
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
