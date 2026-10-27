import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { arquivosProduto } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PASTA_IMPRESSAO } from "@/lib/uploads";

async function buscar(params: Promise<{ id: string; arquivoId: string }>) {
  const { id, arquivoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(arquivoId)) return undefined;
  return db.query.arquivosProduto.findFirst({ where: and(eq(arquivosProduto.id, Number(arquivoId)), eq(arquivosProduto.produtoId, id)) });
}

/** Baixa o arquivo com o nome original (para abrir no Bambu Studio ou mandar para a impressora). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; arquivoId: string }> }) {
  await requireUser();
  const a = await buscar(params);
  if (!a) return new Response("Não encontrado", { status: 404 });
  const nomeAscii = a.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.() -]/g, "_");
  return new Response(Readable.toWeb(createReadStream(`${PASTA_IMPRESSAO}/${a.arquivo}`)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "Content-Length": String(a.tamanho),
      "Cache-Control": "private, no-store",
    },
  });
}

/** Altera a observação (ex.: "placa 1 · corpo vermelho"). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; arquivoId: string }> }) {
  await requireUser();
  const a = await buscar(params);
  if (!a) return Response.json({ erro: "Não encontrado" }, { status: 404 });
  const { observacao } = (await req.json().catch(() => ({}))) as { observacao?: string };
  await db.update(arquivosProduto).set({ observacao: String(observacao ?? "").slice(0, 300) }).where(eq(arquivosProduto.id, a.id));
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; arquivoId: string }> }) {
  await requireUser();
  const a = await buscar(params);
  if (!a) return Response.json({ erro: "Não encontrado" }, { status: 404 });
  await db.delete(arquivosProduto).where(eq(arquivosProduto.id, a.id));
  await rm(`${PASTA_IMPRESSAO}/${a.arquivo}`, { force: true });
  return Response.json({ ok: true });
}
