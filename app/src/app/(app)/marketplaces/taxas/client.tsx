"use client";

import { FileUp, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import {
  enviarContrato,
  escolherCategoriaContrato,
  relerTarifasML,
} from "./actions";

type Estado = { ok?: string; erro?: string } | null;
const Msg = ({ m }: { m: Estado }) =>
  m ? (
    <p className={m.erro ? "text-xs text-red" : "text-xs text-green"}>
      {m.erro ?? m.ok}
    </p>
  ) : null;

/** Envia o contrato: a IA lê e as taxas passam a valer na hora. */
export function EnviarContrato({
  marketplace,
  temContrato,
}: {
  marketplace: string;
  temContrato: boolean;
}) {
  const [estado, onSubmit, pending] = useFormAction(enviarContrato, null);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <input type="hidden" name="marketplace" value={marketplace} />
      <input
        type="file"
        name="arquivo"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        required
        className="w-full min-w-0 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:font-semibold"
      />
      <SubmitButton
        pending={pending}
        variant="outline"
        size="sm"
        pendingText="A IA está lendo o contrato..."
      >
        <FileUp /> {temContrato ? "Enviar contrato novo" : "Enviar contrato"}
      </SubmitButton>
      <Msg m={estado} />
    </form>
  );
}

/** Categoria do contrato usada por uma categoria do catálogo (automático = a IA escolhe). */
export function EscolherCategoria({
  categoriaId,
  marketplace,
  opcoes,
  atual,
  manual,
}: {
  categoriaId: number;
  marketplace: string;
  opcoes: { nome: string; rotulo: string }[];
  atual: string;
  manual: boolean;
}) {
  const [msg, setMsg] = useState<Estado>(null);
  const [salvando, iniciar] = useTransition();
  return (
    <span className="grid gap-1">
      <Select
        aria-label="Categoria do contrato"
        className="h-8 text-xs"
        disabled={salvando}
        value={manual ? atual : ""}
        onChange={(e) =>
          iniciar(async () =>
            setMsg(
              await escolherCategoriaContrato(
                categoriaId,
                marketplace,
                e.target.value || null,
              ),
            ),
          )
        }
      >
        <option value="">
          Automático (IA){!manual && atual ? `: ${atual}` : ""}
        </option>
        {opcoes.map((o) => (
          <option key={o.nome} value={o.nome}>
            {o.rotulo}
          </option>
        ))}
      </Select>
      {salvando ? (
        <span className="text-xs text-muted">Salvando...</span>
      ) : (
        <Msg m={msg} />
      )}
    </span>
  );
}

export function RelerML() {
  const [msg, setMsg] = useState<Estado>(null);
  const [rodando, iniciar] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rodando}
        onClick={() => iniciar(async () => setMsg(await relerTarifasML()))}
      >
        <RefreshCw /> {rodando ? "Consultando o ML..." : "Reler tarifas do ML"}
      </Button>
      <Msg m={msg} />
    </span>
  );
}
