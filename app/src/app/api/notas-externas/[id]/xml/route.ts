import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notasExternas } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const nota = await db.query.notasExternas.findFirst({ where: eq(notasExternas.id, Number((await params).id) || 0) });
  if (!nota?.xml) return new Response("Esta nota não tem XML.", { status: 404 });
  return new Response(nota.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nota.chave}-procNFe.xml"` } });
}
