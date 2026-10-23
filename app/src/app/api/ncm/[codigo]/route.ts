import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ncms } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { garantirNcm } from "@/lib/fiscal/ncm";

// Descrição do NCM para o cadastro de produto: do cadastro ou, se novo, cadastrado e completado pela IA.
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  await requireUser();
  const codigo = (await params).codigo.replace(/\D/g, "");
  if (codigo.length !== 8) return Response.json({ erro: "NCM deve ter 8 dígitos" }, { status: 400 });
  await garantirNcm(codigo);
  const ncm = await db.query.ncms.findFirst({ where: eq(ncms.codigo, codigo) });
  return Response.json(ncm);
}
