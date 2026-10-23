"use client";

import Link from "next/link";
import { Alert, buttonClass, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { RegraFiscal } from "@/db/schema";
import { UFS } from "@/lib/utils";
import { salvarRegra } from "./actions";

const CSOSN = [
  ["", "—"],
  ["101", "101 · Tributada com permissão de crédito"],
  ["102", "102 · Tributada sem permissão de crédito"],
  ["103", "103 · Isenção para faixa de receita"],
  ["201", "201 · Com crédito e cobrança de ICMS-ST"],
  ["202", "202 · Sem crédito e com cobrança de ICMS-ST"],
  ["300", "300 · Imune"],
  ["400", "400 · Não tributada"],
  ["500", "500 · ICMS cobrado anteriormente por ST"],
  ["900", "900 · Outros"],
];
const CST_ICMS = [
  ["", "—"],
  ["00", "00 · Tributada integralmente"],
  ["10", "10 · Tributada com ICMS-ST"],
  ["20", "20 · Com redução de base"],
  ["40", "40 · Isenta"],
  ["41", "41 · Não tributada"],
  ["60", "60 · ICMS cobrado anteriormente por ST"],
  ["90", "90 · Outras"],
];
const CST_PIS_COFINS = [
  ["01", "01 · Tributável (alíquota básica)"],
  ["04", "04 · Monofásica (alíquota zero)"],
  ["06", "06 · Alíquota zero"],
  ["07", "07 · Isenta"],
  ["08", "08 · Sem incidência"],
  ["49", "49 · Outras operações de saída (Simples)"],
  ["99", "99 · Outras operações"],
];
const pct = (n?: number) => (n ? String(n).replace(".", ",") : "0");

export function RegraForm({ regra }: { regra?: RegraFiscal }) {
  const [state, onSubmit, pending] = useFormAction(salvarRegra, null);
  return (
    <Card className="border-gold/50">
      <CardHeader
        title={regra ? `Editar regra: ${regra.nome}` : "Nova regra fiscal"}
        description="Regras mais específicas (NCM, UF, tipo de cliente) e de maior prioridade vencem."
      />
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-6">
        {regra ? <input type="hidden" name="id" value={regra.id} /> : null}
        <Field label="Nome da regra" className="sm:col-span-3">
          <Input name="nome" defaultValue={regra?.nome} required placeholder="Ex.: Venda PLA para consumidor final" />
        </Field>
        <Field label="Natureza da operação" className="sm:col-span-2">
          <Input name="naturezaOperacao" defaultValue={regra?.naturezaOperacao ?? "Venda de produção do estabelecimento"} required />
        </Field>
        <Field label="Prioridade" className="sm:col-span-1">
          <Input name="prioridade" type="number" defaultValue={regra?.prioridade ?? 0} />
        </Field>

        <p className="text-xs font-bold uppercase tracking-widest text-gold sm:col-span-6">Quando aplicar</p>
        <Field label="NCM começa com" className="sm:col-span-2" hint="Vazio = qualquer NCM">
          <Input name="ncmPrefixo" defaultValue={regra?.ncmPrefixo} inputMode="numeric" placeholder="3926" />
        </Field>
        <Field label="UF de destino" className="sm:col-span-2">
          <Select name="ufDestino" defaultValue={regra?.ufDestino ?? ""}>
            <option value="">Qualquer UF</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Destinatário" className="sm:col-span-2">
          <Select name="destinatario" defaultValue={regra?.destinatario ?? "qualquer"}>
            <option value="qualquer">Qualquer</option>
            <option value="nao_contribuinte">Não contribuinte / consumidor final</option>
            <option value="contribuinte">Contribuinte de ICMS</option>
          </Select>
        </Field>

        <p className="text-xs font-bold uppercase tracking-widest text-gold sm:col-span-6">Tributação</p>
        <Field label="CFOP dentro do estado" className="sm:col-span-3">
          <Input name="cfopInterno" defaultValue={regra?.cfopInterno ?? "5101"} required inputMode="numeric" maxLength={4} />
        </Field>
        <Field label="CFOP para outros estados" className="sm:col-span-3">
          <Input name="cfopInterestadual" defaultValue={regra?.cfopInterestadual ?? "6101"} required inputMode="numeric" maxLength={4} />
        </Field>
        <Field label="CSOSN (Simples Nacional)" className="sm:col-span-3">
          <Select name="csosn" defaultValue={regra?.csosn ?? "102"}>
            {CSOSN.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CST ICMS (Regime Normal)" className="sm:col-span-2">
          <Select name="cstIcms" defaultValue={regra?.cstIcms ?? ""}>
            {CST_ICMS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alíq. ICMS %" className="sm:col-span-1">
          <Input name="aliqIcms" inputMode="decimal" defaultValue={pct(regra?.aliqIcms)} />
        </Field>
        <Field label="CST PIS" className="sm:col-span-2">
          <Select name="cstPis" defaultValue={regra?.cstPis ?? "49"}>
            {CST_PIS_COFINS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alíq. PIS %" className="sm:col-span-1">
          <Input name="aliqPis" inputMode="decimal" defaultValue={pct(regra?.aliqPis)} />
        </Field>
        <Field label="CST COFINS" className="sm:col-span-2">
          <Select name="cstCofins" defaultValue={regra?.cstCofins ?? "49"}>
            {CST_PIS_COFINS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alíq. COFINS %" className="sm:col-span-1">
          <Input name="aliqCofins" inputMode="decimal" defaultValue={pct(regra?.aliqCofins)} />
        </Field>
        <Field label="CST IPI" className="sm:col-span-2" hint="Vazio = sem IPI (comum no Simples)">
          <Input name="cstIpi" defaultValue={regra?.cstIpi} maxLength={2} />
        </Field>
        <Field label="Alíq. IPI %" className="sm:col-span-1">
          <Input name="aliqIpi" inputMode="decimal" defaultValue={pct(regra?.aliqIpi)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-3 sm:self-end sm:pb-2.5">
          <input type="checkbox" name="ativo" defaultChecked={regra?.ativo ?? true} className="size-4 accent-[var(--gold)]" />
          Regra ativa
        </label>

        {state?.erro ? (
          <div className="sm:col-span-6">
            <Alert>{state.erro}</Alert>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 sm:col-span-6">
          <Link href="/fiscal" className={buttonClass("ghost")}>
            Cancelar
          </Link>
          <SubmitButton pending={pending} pendingText="Salvando...">Salvar regra</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
