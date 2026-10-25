"use client";

import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { Alert, Card, CardHeader, Field, Input } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { definirMinimo, movimentarManual } from "../actions";

const TIPOS = [
  { id: "entrada", nome: "Entrada", icone: ArrowDownToLine, ajuda: "Peças que entraram (produção avulsa, devolução...)." },
  { id: "saida", nome: "Saída", icone: ArrowUpFromLine, ajuda: "Peças que saíram fora de um pedido (brinde, perda, defeito...)." },
  { id: "ajuste", nome: "Contagem", icone: ClipboardCheck, ajuda: "Informe quantas peças existem de fato: o saldo vai para esse número." },
] as const;

export function Movimentar({ produtoId, saldo, minimo }: { produtoId: string; saldo: number; minimo: number }) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["id"]>("entrada");
  const [state, onSubmit, pending] = useFormAction(movimentarManual.bind(null, produtoId), null);
  const [stMin, onMin, pendMin] = useFormAction(definirMinimo.bind(null, produtoId), null);
  const t = TIPOS.find((x) => x.id === tipo)!;
  return (
    <div className="grid content-start gap-6">
      <Card>
        <CardHeader title="Movimentar" description={`Saldo atual: ${saldo}`} />
        <form onSubmit={onSubmit} className="grid gap-4 p-5">
          <input type="hidden" name="tipo" value={tipo} />
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1">
            {TIPOS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setTipo(x.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold",
                  tipo === x.id ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground",
                )}
              >
                <x.icone className="size-4" /> {x.nome}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t.ajuda}</p>
          <Field label={tipo === "ajuste" ? "Quantidade contada" : "Quantidade"}>
            <Input key={tipo} name="quantidade" type="number" min={0} defaultValue={tipo === "ajuste" ? saldo : ""} required />
          </Field>
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
      <Card>
        <CardHeader title="Estoque mínimo" description="Abaixo disso o produto aparece em Repor." />
        <form onSubmit={onMin} className="flex items-end gap-3 p-5">
          <Field label="Mínimo" className="flex-1">
            <Input name="minimo" type="number" min={0} defaultValue={minimo} />
          </Field>
          <SubmitButton pending={pendMin} variant="outline" pendingText="...">
            Salvar
          </SubmitButton>
        </form>
        {stMin?.ok ? <p className="px-5 pb-4 text-xs text-green">{stMin.ok}</p> : null}
      </Card>
    </div>
  );
}
