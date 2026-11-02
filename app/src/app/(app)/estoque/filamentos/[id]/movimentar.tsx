"use client";

import { useState } from "react";
import { Alert, Card, CardHeader, Field, Input } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { movimentarFilamentoManual } from "../actions";

const TIPOS = [
  { id: "ajuste", nome: "Pesagem", ajuda: "Pese os rolos (sem o carretel) e informe o total em gramas: o saldo vai para esse valor." },
  { id: "entrada", nome: "Entrada", ajuda: "Compra sem nota ou rolo ganho. Para compras com NF-e, use Compras › Notas de entrada." },
  { id: "consumo", nome: "Consumo", ajuda: "Gasto fora de uma produção registrada (teste, calibração...)." },
] as const;

export function MovimentarFilamento({ id, saldoG }: { id: number; saldoG: number }) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("ajuste");
  const [state, onSubmit, pending] = useFormAction(movimentarFilamentoManual.bind(null, id), null);
  const t = TIPOS.find((x) => x.id === tipo)!;
  return (
    <Card>
      <CardHeader title="Movimentar" description={`Saldo atual: ${saldoG} g`} />
      <form onSubmit={onSubmit} className="grid gap-4 p-5">
        <input type="hidden" name="tipo" value={tipo} />
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1">
          {TIPOS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTipo(x.id)}
              className={cn("rounded-lg py-2 text-xs font-semibold", tipo === x.id ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground")}
            >
              {x.nome}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{t.ajuda}</p>
        <Field label={tipo === "ajuste" ? "Peso real (g)" : "Gramas"}>
          <Input key={tipo} name="gramas" type="number" min={0} defaultValue={tipo === "ajuste" ? saldoG : ""} required />
        </Field>
        {tipo === "entrada" ? (
          <Field label="Valor pago por essas gramas (R$)" hint="Entra no custo médio do grama.">
            <Input name="valorPago" inputMode="decimal" placeholder="Ex.: 89,90" />
          </Field>
        ) : null}
        <Field label="Observação">
          <Input name="observacao" placeholder="Opcional" />
        </Field>
        {state?.erro ? <Alert>{state.erro}</Alert> : null}
        {state?.ok ? <Alert tone="green">{state.ok}</Alert> : null}
        <SubmitButton pending={pending} pendingText="Salvando...">
          Registrar {t.nome.toLowerCase()}
        </SubmitButton>
      </form>
    </Card>
  );
}
