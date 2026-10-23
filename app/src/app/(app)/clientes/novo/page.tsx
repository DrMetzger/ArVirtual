import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ClienteForm } from "../cliente-form";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo cliente" description="CNPJ: dados e endereço vêm direto da Receita. CPF: validação dos dígitos (nome via Serpro, se configurado)." />
      <ClienteForm />
    </>
  );
}
