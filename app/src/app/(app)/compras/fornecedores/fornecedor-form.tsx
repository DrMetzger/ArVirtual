"use client";

import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Fornecedor } from "@/db/schema";
import { formatDocumento, onlyDigits } from "@/lib/utils";
import { salvarFornecedor } from "../actions";

export function FornecedorForm({ fornecedor }: { fornecedor?: Fornecedor }) {
  const [state, onSubmit, pending] = useFormAction(salvarFornecedor.bind(null, fornecedor?.id ?? null), null);
  const [d, setD] = useState({
    documento: fornecedor ? formatDocumento(fornecedor.documento) : "",
    nome: fornecedor?.nome ?? "",
    nomeFantasia: fornecedor?.nomeFantasia ?? "",
    inscricaoEstadual: fornecedor?.inscricaoEstadual ?? "",
    email: fornecedor?.email ?? "",
    telefone: fornecedor?.telefone ?? "",
    cidade: fornecedor?.cidade ?? "",
    uf: fornecedor?.uf ?? "",
  });
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState("");
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  async function buscar() {
    setBuscando(true);
    setAviso("");
    try {
      const res = await fetch(`/api/documento/${onlyDigits(d.documento)}`);
      const r = await res.json();
      if (!res.ok) throw new Error(r.erro);
      setD((x) => ({
        ...x,
        nome: r.nome || x.nome,
        nomeFantasia: r.nomeFantasia || x.nomeFantasia,
        inscricaoEstadual: r.inscricaoEstadual || x.inscricaoEstadual,
        email: r.email || x.email,
        telefone: r.telefone || x.telefone,
        cidade: r.endereco?.cidade || x.cidade,
        uf: r.endereco?.uf || x.uf,
      }));
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Dados do fornecedor" description="CNPJ: busque na Receita para preencher." />
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-6">
        <Field label="CPF / CNPJ" className="sm:col-span-3">
          <div className="flex gap-2">
            <Input name="documento" value={d.documento} onChange={(e) => setD({ ...d, documento: formatDocumento(onlyDigits(e.target.value).slice(0, 14)) })} required />
            <Button type="button" variant="gold" onClick={buscar} disabled={buscando || onlyDigits(d.documento).length < 11}>
              {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar
            </Button>
          </div>
        </Field>
        <Field label="Inscrição estadual" className="sm:col-span-3">
          <Input name="inscricaoEstadual" value={d.inscricaoEstadual} onChange={set("inscricaoEstadual")} />
        </Field>
        <Field label="Razão social / nome" className="sm:col-span-4">
          <Input name="nome" value={d.nome} onChange={set("nome")} required />
        </Field>
        <Field label="Nome fantasia" className="sm:col-span-2">
          <Input name="nomeFantasia" value={d.nomeFantasia} onChange={set("nomeFantasia")} />
        </Field>
        <Field label="E-mail" className="sm:col-span-2">
          <Input name="email" type="email" value={d.email} onChange={set("email")} />
        </Field>
        <Field label="Telefone" className="sm:col-span-2">
          <Input name="telefone" value={d.telefone} onChange={set("telefone")} />
        </Field>
        <Field label="Cidade" className="sm:col-span-1">
          <Input name="cidade" value={d.cidade} onChange={set("cidade")} />
        </Field>
        <Field label="UF" className="sm:col-span-1">
          <Input name="uf" value={d.uf} onChange={set("uf")} maxLength={2} />
        </Field>
        <Field label="Observações" className="sm:col-span-6">
          <Textarea name="observacoes" defaultValue={fornecedor?.observacoes} rows={2} />
        </Field>
        {aviso || state?.erro ? (
          <div className="sm:col-span-6">
            <Alert>{state?.erro ?? aviso}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-6">
          <SubmitButton pending={pending} pendingText="Salvando...">
            {fornecedor ? "Salvar" : "Cadastrar fornecedor"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
