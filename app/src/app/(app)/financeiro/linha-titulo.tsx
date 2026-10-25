"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { baixar } from "./actions";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Botão "Baixar" que abre o formulário na própria linha (data, valor, conta, forma). */
export function Baixar({ id, valor, tipo, contas }: { id: number; valor: number; tipo: "receber" | "pagar"; contas: { id: number; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [state, onSubmit, pending] = useFormAction(baixar.bind(null, id), null);
  if (!aberto)
    return (
      <Button type="button" size="sm" variant="primary" onClick={() => setAberto(true)}>
        <Check /> {tipo === "receber" ? "Receber" : "Pagar"}
      </Button>
    );
  return (
    <form onSubmit={onSubmit} className="grid min-w-72 gap-2 rounded-xl border border-border bg-surface-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" name="data" defaultValue={hoje()} required />
        <Input name="valor" inputMode="decimal" defaultValue={String(valor).replace(".", ",")} title={tipo === "receber" ? "Valor que entrou (já sem taxas)" : "Valor pago"} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select name="conta" defaultValue={contas[0]?.id}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Select name="forma" defaultValue="pix">
          <option value="pix">Pix</option>
          <option value="repasse">Repasse marketplace</option>
          <option value="boleto">Boleto</option>
          <option value="cartao">Cartão</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="transferencia">Transferência</option>
        </Select>
      </div>
      {state?.erro ? <p className="text-xs text-red">{state.erro}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <SubmitButton size="sm" pending={pending} pendingText="...">
          Confirmar
        </SubmitButton>
      </div>
    </form>
  );
}
