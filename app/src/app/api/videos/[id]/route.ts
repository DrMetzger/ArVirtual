import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { baixarNaFila } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { PASTA_AFILIADOS } from "@/lib/uploads";

const buscar = async (id: string) => (/^\d+$/.test(id) ? db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, Number(id)) }) : undefined);

/** Tentar de novo um vídeo que deu erro. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const v = await buscar((await params).id);
  if (!v?.urlOrigem) return Response.json({ erro: "Vídeo não encontrado." }, { status: 404 });
  await db.update(afiliadosVideos).set({ status: "baixando", erro: "" }).where(eq(afiliadosVideos.id, v.id));
  baixarNaFila(v.id, v.urlOrigem);
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const v = await buscar((await params).id);
  if (!v) return Response.json({ ok: true });
  await db.delete(afiliadosVideos).where(eq(afiliadosVideos.id, v.id));
  if (v.arquivo) await rm(`${PASTA_AFILIADOS}/${v.arquivo}`, { force: true });
  return Response.json({ ok: true });
}
