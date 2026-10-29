import { asc } from "drizzle-orm";
import { db } from "@/db";
import { ncms } from "@/db/schema";
import { requireUser } from "@/lib/auth";

// NCMs já cadastrados, para escolher na lista do cadastro de produto.
export async function GET() {
  await requireUser();
  const lista = await db.select({ codigo: ncms.codigo, descricao: ncms.descricao, pendente: ncms.pendente }).from(ncms).orderBy(asc(ncms.codigo));
  // Pendente ainda tem o texto provisório ("descrição pendente"): na lista vai só o código.
  return Response.json(lista.map((n) => ({ codigo: n.codigo, descricao: n.pendente ? "" : n.descricao })));
}
