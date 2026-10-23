"use client";

import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { formatCep, onlyDigits, UFS } from "@/lib/utils";

export type AddressValues = {
  apelido?: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoIbge: string;
};

export const emptyAddress: AddressValues = {
  apelido: "Principal",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "SP",
  codigoIbge: "",
};

/** Campos de endereço com busca automática de CEP (base dos Correios via ViaCEP/BrasilAPI). */
export function AddressFields({
  value,
  onChange,
  showApelido = true,
}: {
  value: AddressValues;
  onChange: (v: AddressValues) => void;
  showApelido?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k: keyof AddressValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });

  async function buscarCep(cepRaw: string) {
    const cep = onlyDigits(cepRaw);
    if (cep.length !== 8) return;
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/cep/${cep}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "CEP não encontrado");
      onChange({
        ...value,
        cep: formatCep(cep),
        logradouro: data.logradouro || value.logradouro,
        bairro: data.bairro || value.bairro,
        cidade: data.cidade,
        uf: data.uf,
        codigoIbge: data.codigoIbge,
      });
      document.querySelector<HTMLInputElement>('input[name="numero"]')?.focus();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      {showApelido ? (
        <Field label="Identificação" className="sm:col-span-2" hint="Ex.: Entrega, Cobrança, Loja">
          <Input name="apelido" value={value.apelido ?? ""} onChange={set("apelido")} required />
        </Field>
      ) : null}
      <Field label="CEP" className="sm:col-span-2" error={erro} hint="Preenche o endereço automaticamente">
        <div className="relative">
          <Input
            name="cep"
            inputMode="numeric"
            placeholder="00000-000"
            value={value.cep}
            onChange={(e) => {
              const v = formatCep(e.target.value).slice(0, 9);
              onChange({ ...value, cep: v });
              if (onlyDigits(v).length === 8) void buscarCep(v);
            }}
            required
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          </span>
        </div>
      </Field>
      <Field label="Logradouro" className={showApelido ? "sm:col-span-2" : "sm:col-span-4"}>
        <Input name="logradouro" value={value.logradouro} onChange={set("logradouro")} required />
      </Field>
      <Field label="Número" className="sm:col-span-1">
        <Input name="numero" value={value.numero} onChange={set("numero")} required />
      </Field>
      <Field label="Complemento" className="sm:col-span-2">
        <Input name="complemento" value={value.complemento} onChange={set("complemento")} />
      </Field>
      <Field label="Bairro" className="sm:col-span-3">
        <Input name="bairro" value={value.bairro} onChange={set("bairro")} required />
      </Field>
      <Field label="Cidade" className="sm:col-span-3">
        <Input name="cidade" value={value.cidade} onChange={set("cidade")} required />
      </Field>
      <Field label="UF" className="sm:col-span-1">
        <Select name="uf" value={value.uf} onChange={set("uf")}>
          {UFS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
      </Field>
      <Field label="Cód. IBGE" className="sm:col-span-2" hint="Exigido na NF-e">
        <Input name="codigoIbge" value={value.codigoIbge} onChange={set("codigoIbge")} inputMode="numeric" />
      </Field>
    </div>
  );
}
