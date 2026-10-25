import { asc, desc, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { onlyDigits } from "@/lib/utils";

/** Busca de clientes para os campos de seleção (nome, CPF/CNPJ, e-mail ou telefone). */
export async function GET(req: Request) {
  await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/\s+/g, "%")}%`;
  const digitos = onlyDigits(q);
  const lista = await db.query.clientes.findMany({
    columns: { id: true, nome: true, documento: true, email: true },
    with: { enderecos: { columns: { id: true, apelido: true, cidade: true, uf: true, principal: true } } },
    where: q
      ? or(ilike(clientes.nome, like), ilike(clientes.nomeFantasia, like), ilike(clientes.email, like), ...(digitos.length >= 3 ? [ilike(clientes.documento, `%${digitos}%`), ilike(clientes.telefone, `%${digitos}%`)] : []))
      : undefined,
    orderBy: q ? asc(clientes.nome) : desc(clientes.atualizadoEm),
    limit: 25,
  });
  return Response.json({ clientes: lista });
}
