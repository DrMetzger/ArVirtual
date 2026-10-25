"use client";

import { Input } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { salvarConta } from "../actions";

export function ContaForm({ conta }: { conta?: { id: number; nome: string; saldoInicial: number; ativo: boolean } }) {
  const [state, onSubmit, pending] = useFormAction(salvarConta.bind(null, conta?.id ?? null), null);
  return (
    <form onSubmit={onSubmit} className="grid items-center gap-2 sm:grid-cols-[1fr_160px_auto_auto]">
      <Input name="nome" defaultValue={conta?.nome} placeholder="Ex.: Banco Inter, Mercado Pago" required />
      <Input name="saldoInicial" inputMode="decimal" defaultValue={conta ? String(conta.saldoInicial).replace(".", ",") : ""} placeholder="Saldo inicial" title="Saldo no dia em que começou a usar o sistema" />
      {conta ? (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="ativo" defaultChecked={conta.ativo} className="accent-[var(--gold)]" /> Ativa
        </label>
      ) : (
        <span />
      )}
      <SubmitButton size="sm" variant={conta ? "outline" : "primary"} pending={pending} pendingText="...">
        {conta ? "Salvar" : "Adicionar"}
      </SubmitButton>
      {state?.erro ? <p className="text-xs text-red sm:col-span-4">{state.erro}</p> : null}
      {state?.ok ? <p className="text-xs text-green sm:col-span-4">{state.ok}</p> : null}
    </form>
  );
}
