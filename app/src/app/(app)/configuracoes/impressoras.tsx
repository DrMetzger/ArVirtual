"use client";

import { Plus, Printer, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Impressora } from "@/db/schema";
import { excluirImpressora, salvarImpressora } from "./impressoras-actions";

type Modelos = Record<string, { area: [number, number, number]; cores: number; potenciaW: number }>;

/** Impressoras da oficina: cada uma com a sua área, cores (AMS) e consumo. Usadas para saber o que cabe em qual. */
export function Impressoras({ lista, modelos }: { lista: Impressora[]; modelos: Modelos }) {
  const [nova, setNova] = useState(false);
  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Printer className="size-5 text-gold" /> Minhas impressoras ({lista.length})
          </span>
        }
        description="Cadastre todas as impressoras. Ao importar um modelo 3D, o sistema mostra em quais delas a peça cabe (tamanho e número de cores)."
        action={
          !nova ? (
            <Button type="button" variant="gold" size="sm" onClick={() => setNova(true)}>
              <Plus /> Adicionar impressora
            </Button>
          ) : null
        }
      />
      <div className="divide-y divide-border">
        {nova ? <FormImpressora modelos={modelos} aoSalvar={() => setNova(false)} aoCancelar={() => setNova(false)} /> : null}
        {lista.map((i) => (
          <FormImpressora key={`${i.id}-${i.atualizadoEm.toString()}`} i={i} modelos={modelos} />
        ))}
      </div>
    </Card>
  );
}

function FormImpressora({ i, modelos, aoSalvar, aoCancelar }: { i?: Impressora; modelos: Modelos; aoSalvar?: () => void; aoCancelar?: () => void }) {
  const [estado, onSubmit, pending] = useFormAction(async (s: Awaited<ReturnType<typeof salvarImpressora>>, f: FormData) => {
    const r = await salvarImpressora(s, f);
    if (r?.ok) aoSalvar?.();
    return r;
  }, null);
  const [msgExcluir, setMsgExcluir] = useState<{ ok?: string; erro?: string } | null>(null);
  const [excluindo, iniciar] = useTransition();
  const inicial = i ?? { modelo: "Bambu Lab A1 mini", larguraMm: 180, profundidadeMm: 180, alturaMm: 180, cores: 4, potenciaW: 95 };
  const [modelo, setModelo] = useState(inicial.modelo);
  const [area, setArea] = useState({ l: inicial.larguraMm, p: inicial.profundidadeMm, a: inicial.alturaMm, cores: inicial.cores, w: inicial.potenciaW });
  const trocarModelo = (m: string) => {
    setModelo(m);
    const p = modelos[m];
    if (p) setArea({ l: p.area[0], p: p.area[1], a: p.area[2], cores: p.cores, w: p.potenciaW });
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-3 p-5 sm:grid-cols-6">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      <Field label="Nome" className="sm:col-span-2">
        <Input name="nome" required defaultValue={i?.nome ?? ""} placeholder="Ex.: A1 mini da sala" />
      </Field>
      <Field label="Modelo" className="sm:col-span-2">
        <Select name="modelo" value={modelo} onChange={(e) => trocarModelo(e.target.value)}>
          {Object.keys(modelos).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cores de uma vez (AMS)" className="sm:col-span-2" hint="AMS lite/AMS: 4 · sem AMS: 1">
        <Input name="cores" inputMode="numeric" value={area.cores} onChange={(e) => setArea({ ...area, cores: Number(e.target.value) || 1 })} />
      </Field>
      <Field label="Largura (mm)" className="sm:col-span-1">
        <Input name="larguraMm" inputMode="numeric" value={area.l} onChange={(e) => setArea({ ...area, l: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Profund. (mm)" className="sm:col-span-1">
        <Input name="profundidadeMm" inputMode="numeric" value={area.p} onChange={(e) => setArea({ ...area, p: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Altura (mm)" className="sm:col-span-1">
        <Input name="alturaMm" inputMode="numeric" value={area.a} onChange={(e) => setArea({ ...area, a: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Bico (mm)" className="sm:col-span-1">
        <Input name="bicoMm" inputMode="decimal" defaultValue={String(i?.bicoMm ?? 0.4).replace(".", ",")} />
      </Field>
      <Field label="Consumo (W)" className="sm:col-span-2">
        <Input name="potenciaW" inputMode="numeric" value={area.w} onChange={(e) => setArea({ ...area, w: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Materiais que ela imprime" className="sm:col-span-4">
        <Input name="materiais" defaultValue={i?.materiais ?? "PLA, PETG"} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
        <input type="checkbox" name="ativa" defaultChecked={i?.ativa ?? true} className="size-4 accent-[var(--gold)]" /> Em uso
        {i && !i.ativa ? <Badge tone="neutral">desativada</Badge> : null}
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
        <SubmitButton pending={pending} size="sm" pendingText="Salvando...">
          {i ? "Salvar" : "Adicionar"}
        </SubmitButton>
        {aoCancelar ? (
          <Button type="button" variant="ghost" size="sm" onClick={aoCancelar}>
            Cancelar
          </Button>
        ) : null}
        {i ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={excluindo}
            onClick={() => confirm(`Excluir ${i.nome}?`) && iniciar(async () => setMsgExcluir(await excluirImpressora(i.id)))}
          >
            <Trash2 className="text-red" /> Excluir
          </Button>
        ) : null}
      </div>
      {estado?.erro || msgExcluir?.erro ? (
        <div className="sm:col-span-6">
          <Alert>{estado?.erro ?? msgExcluir?.erro}</Alert>
        </div>
      ) : estado?.ok ? (
        <p className="text-xs text-green sm:col-span-6">{estado.ok}</p>
      ) : null}
    </form>
  );
}
