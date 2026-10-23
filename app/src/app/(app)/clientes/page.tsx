import { and, asc, eq, ilike, or } from "drizzle-orm";
import { Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { clientes, enderecos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDocumento, formatTelefone, onlyDigits } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const digits = onlyDigits(q);

  const lista = await db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      nomeFantasia: clientes.nomeFantasia,
      tipo: clientes.tipo,
      documento: clientes.documento,
      telefone: clientes.telefone,
      email: clientes.email,
      cidade: enderecos.cidade,
      uf: enderecos.uf,
    })
    .from(clientes)
    .leftJoin(enderecos, and(eq(enderecos.clienteId, clientes.id), eq(enderecos.principal, true)))
    .where(
      q
        ? or(
            ilike(clientes.nome, `%${q}%`),
            ilike(clientes.nomeFantasia, `%${q}%`),
            ilike(clientes.email, `%${q}%`),
            ...(digits.length >= 3 ? [ilike(clientes.documento, `%${digits}%`)] : []),
          )
        : undefined,
    )
    .orderBy(asc(clientes.nome))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas físicas e jurídicas, com dados da Receita e vários endereços."
        actions={
          <Link href="/clientes/novo" className={buttonClass()}>
            <Plus /> Novo cliente
          </Link>
        }
      />
      <Card>
        <form className="flex gap-2 border-b border-border p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Buscar por nome, CPF/CNPJ ou e-mail" className="pl-9" />
          </div>
        </form>
        {lista.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            description={q ? "Tente outro termo." : "Cadastre o primeiro cliente buscando o CNPJ direto na Receita."}
            action={
              !q ? (
                <Link href="/clientes/novo" className={buttonClass("gold")}>
                  <Plus /> Cadastrar cliente
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Cidade</th>
                  <th>Contato</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="min-w-52">
                      <Link href={`/clientes/${c.id}`} className="font-semibold hover:text-gold">
                        {c.nome}
                      </Link>
                      {c.nomeFantasia ? <p className="text-xs text-muted">{c.nomeFantasia}</p> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tone={c.tipo === "PJ" ? "blue" : "gold"} className="mr-2">
                        {c.tipo}
                      </Badge>
                      <span className="font-mono text-xs">{formatDocumento(c.documento)}</span>
                    </td>
                    <td className="text-muted">{c.cidade ? `${c.cidade}/${c.uf}` : "—"}</td>
                    <td className="text-muted">
                      {c.telefone ? <p>{formatTelefone(c.telefone)}</p> : null}
                      {c.email ? <p className="text-xs">{c.email}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
