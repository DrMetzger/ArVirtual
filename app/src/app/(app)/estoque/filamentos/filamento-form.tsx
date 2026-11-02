"use client";

import { Alert, Card, CardHeader, Field, Input } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Filamento } from "@/db/schema";
import { salvarFilamento } from "./actions";

const MATERIAIS = ["PLA", "PLA+", "PLA Silk", "PLA Matte", "PETG", "ABS", "ASA", "TPU", "Outro"];

export function FilamentoForm({ filamento }: { filamento?: Filamento }) {
  const [state, onSubmit, pending] = useFormAction(salvarFilamento.bind(null, filamento?.id ?? null), null);
  return (
    <Card>
      <CardHeader title={filamento ? "Dados do filamento" : "Novo filamento"} />
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Material">
          <Input name="material" list="materiais" defaultValue={filamento?.material ?? "PLA"} required />
          <datalist id="materiais">
            {MATERIAIS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Cor">
          <div className="flex gap-2">
            <input type="color" name="corHex" defaultValue={filamento?.corHex ?? "#222222"} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1" />
            <Input name="cor" defaultValue={filamento?.cor} placeholder="Preto, Branco, Azul..." required />
          </div>
        </Field>
        <Field label="Marca">
          <Input name="marca" defaultValue={filamento?.marca} placeholder="Bambu, Voolt3D, 3D Fila..." />
        </Field>
        <Field label="Alerta abaixo de (g)" hint="Aparece como 'comprar' quando o saldo ficar menor.">
          <Input name="minimoG" type="number" min={0} defaultValue={filamento?.minimoG ?? 500} />
        </Field>
        {filamento ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="ativo" defaultChecked={filamento.ativo} className="size-4 accent-[var(--gold)]" /> Ativo
          </label>
        ) : (
          <>
            <Field label="Saldo atual (g)" hint="Quanto você tem hoje (pese os rolos abertos).">
              <Input name="saldoG" type="number" min={0} placeholder="Ex.: 2350" />
            </Field>
            <Field label="Valor pago no rolo (R$)" hint="O custo do grama sai do valor ÷ peso do rolo.">
              <Input name="valorPago" inputMode="decimal" placeholder="Ex.: 89,90" />
            </Field>
            <Field label="Peso do rolo (g)">
              <Input name="pesoRoloG" type="number" min={1} defaultValue={1000} />
            </Field>
          </>
        )}
        {state?.erro ? (
          <div className="sm:col-span-2">
            <Alert>{state.erro}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <SubmitButton pending={pending} pendingText="Salvando...">
            {filamento ? "Salvar" : "Cadastrar filamento"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
