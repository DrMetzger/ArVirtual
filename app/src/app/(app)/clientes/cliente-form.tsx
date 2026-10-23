"use client";

import { BadgeCheck, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { AddressFields, emptyAddress, type AddressValues } from "@/components/address-fields";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Cliente } from "@/db/schema";
import { formatCep, formatDocumento, formatTelefone, onlyDigits } from "@/lib/utils";
import { salvarCliente } from "./actions";

type Dados = Pick<
  Cliente,
  "documento" | "nome" | "nomeFantasia" | "inscricaoEstadual" | "indicadorIe" | "email" | "telefone" | "situacaoCadastral" | "observacoes"
>;

const vazio: Dados = {
  documento: "",
  nome: "",
  nomeFantasia: "",
  inscricaoEstadual: "",
  indicadorIe: 9,
  email: "",
  telefone: "",
  situacaoCadastral: "",
  observacoes: "",
};

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const [state, onSubmit, pending] = useFormAction(salvarCliente, null);
  const [dados, setDados] = useState<Dados>(
    cliente ? { ...cliente, documento: formatDocumento(cliente.documento), telefone: formatTelefone(cliente.telefone) } : vazio,
  );
  const [endereco, setEndereco] = useState<AddressValues>(emptyAddress);
  const [receita, setReceita] = useState<{ fonte: string; json: string } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<{ tone: "red" | "gold"; msg: string } | null>(null);

  const doc = onlyDigits(dados.documento);
  const tipo = doc.length === 14 ? "PJ" : doc.length === 11 ? "PF" : null;
  const set = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDados({ ...dados, [k]: k === "indicadorIe" ? Number(e.target.value) : e.target.value });

  async function consultarReceita() {
    setConsultando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/documento/${doc}`);
      const r = await res.json();
      if (!res.ok) throw new Error(r.erro);
      setDados((d) => ({
        ...d,
        nome: r.nome || d.nome,
        nomeFantasia: r.nomeFantasia || d.nomeFantasia,
        inscricaoEstadual: r.inscricaoEstadual || d.inscricaoEstadual,
        indicadorIe: r.inscricaoEstadual ? 1 : d.indicadorIe,
        email: r.email || d.email,
        telefone: r.telefone ? formatTelefone(r.telefone) : d.telefone,
        situacaoCadastral: r.situacao || d.situacaoCadastral,
      }));
      if (r.endereco && !cliente) {
        setEndereco({ ...emptyAddress, ...r.endereco, cep: formatCep(r.endereco.cep), apelido: "Principal" });
      }
      setReceita({ fonte: r.fonte, json: JSON.stringify(r) });
      if (r.situacao && !/ativa|regular/i.test(r.situacao)) {
        setAviso({ tone: "gold", msg: `Atenção: situação cadastral "${r.situacao}".` });
      }
    } catch (e) {
      setAviso({ tone: "red", msg: (e as Error).message });
    } finally {
      setConsultando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}
      {receita ? <input type="hidden" name="dadosReceita" value={receita.json} /> : null}

      <Card>
        <CardHeader
          title="Dados cadastrais"
          description="Digite o CPF ou CNPJ e busque os dados oficiais na Receita Federal."
          action={tipo ? <Badge tone={tipo === "PJ" ? "blue" : "gold"}>{tipo === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</Badge> : null}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-6">
          <Field label="CPF / CNPJ" className="sm:col-span-3">
            <div className="flex gap-2">
              <Input
                name="documento"
                inputMode="numeric"
                value={dados.documento}
                onChange={(e) => setDados({ ...dados, documento: formatDocumento(onlyDigits(e.target.value).slice(0, 14)) })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                required
              />
              <Button type="button" variant="gold" onClick={consultarReceita} disabled={!tipo || consultando}>
                {consultando ? <Loader2 className="animate-spin" /> : <Search />}
                Receita
              </Button>
            </div>
          </Field>
          <Field label="Situação cadastral" className="sm:col-span-3">
            <div className="flex h-10 items-center gap-2">
              {dados.situacaoCadastral ? (
                <Badge tone={/ativa|regular/i.test(dados.situacaoCadastral) ? "green" : "red"}>
                  <BadgeCheck className="size-3.5" />
                  {dados.situacaoCadastral}
                </Badge>
              ) : (
                <span className="text-sm text-muted">Não consultada</span>
              )}
              {receita ? <span className="text-xs text-muted">Fonte: {receita.fonte}</span> : null}
              <input type="hidden" name="situacaoCadastral" value={dados.situacaoCadastral} />
            </div>
          </Field>
          {aviso ? (
            <div className="sm:col-span-6">
              <Alert tone={aviso.tone}>{aviso.msg}</Alert>
            </div>
          ) : null}
          <Field label={tipo === "PF" ? "Nome completo" : "Razão social"} className="sm:col-span-4">
            <Input name="nome" value={dados.nome} onChange={set("nome")} required />
          </Field>
          <Field label="Nome fantasia / apelido" className="sm:col-span-2">
            <Input name="nomeFantasia" value={dados.nomeFantasia} onChange={set("nomeFantasia")} />
          </Field>
          <Field label="Indicador de IE" className="sm:col-span-2" hint="Define o CFOP e o tratamento do ICMS">
            <Select name="indicadorIe" value={dados.indicadorIe} onChange={set("indicadorIe")}>
              <option value={9}>Não contribuinte</option>
              <option value={1}>Contribuinte de ICMS</option>
              <option value={2}>Contribuinte isento</option>
            </Select>
          </Field>
          <Field label="Inscrição estadual" className="sm:col-span-2">
            <Input name="inscricaoEstadual" value={dados.inscricaoEstadual} onChange={set("inscricaoEstadual")} />
          </Field>
          <Field label="Telefone" className="sm:col-span-2">
            <Input
              name="telefone"
              inputMode="tel"
              value={dados.telefone}
              onChange={(e) => setDados({ ...dados, telefone: formatTelefone(onlyDigits(e.target.value).slice(0, 11)) })}
            />
          </Field>
          <Field label="E-mail" className="sm:col-span-3">
            <Input name="email" type="email" value={dados.email} onChange={set("email")} />
          </Field>
          <Field label="Observações" className="sm:col-span-3">
            <Textarea name="observacoes" value={dados.observacoes} onChange={set("observacoes")} className="min-h-10" rows={1} />
          </Field>
        </div>
      </Card>

      {!cliente ? (
        <Card>
          <CardHeader title="Endereço principal" description="Outros endereços (entrega, cobrança...) podem ser adicionados depois de salvar." />
          <div className="p-5">
            <AddressFields value={endereco} onChange={setEndereco} />
          </div>
        </Card>
      ) : null}

      {state?.erro ? <Alert>{state.erro}</Alert> : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending} size="lg" pendingText="Salvando...">
          {cliente ? "Salvar alterações" : "Cadastrar cliente"}
        </SubmitButton>
      </div>
    </form>
  );
}
