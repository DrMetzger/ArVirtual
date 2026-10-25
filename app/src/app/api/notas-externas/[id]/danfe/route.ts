import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notasExternas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { gerarDanfe } from "@/lib/nfe/danfe";

/** DANFE da nota emitida fora (a partir do XML que o marketplace devolveu). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const nota = await db.query.notasExternas.findFirst({ where: eq(notasExternas.id, Number((await params).id) || 0) });
  if (!nota?.xml) return new Response("Esta nota não tem XML.", { status: 404 });
  try {
    const pdf = await gerarDanfe(nota.xml);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nota.chave}.pdf"` } });
  } catch (e) {
    return new Response(`Não foi possível gerar a DANFE: ${(e as Error).message}`, { status: 500 });
  }
}
