import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PASTA_AFILIADOS } from "@/lib/uploads";

const TIPOS: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** Assiste (com Range, para o player avançar) ou baixa (?baixar=1) um vídeo da biblioteca. Só com login. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const v = /^\d+$/.test(id) ? await db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, Number(id)) }) : undefined;
  if (!v?.arquivo) return new Response("Não encontrado", { status: 404 });
  const caminho = `${PASTA_AFILIADOS}/${v.arquivo}`;
  const tamanho = await stat(caminho).then((s) => s.size).catch(() => -1);
  if (tamanho < 0) return new Response("Não encontrado", { status: 404 });
  const ext = v.arquivo.split(".").pop() ?? "mp4";
  const nome = `${(v.titulo || `video-${v.id}`).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.() -]/g, "_").slice(0, 80)}.${ext}`;
  const headers = {
    "Content-Type": TIPOS[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    ...(new URL(req.url).searchParams.get("baixar") ? { "Content-Disposition": `attachment; filename="${nome}"` } : {}),
  };
  const stream = (inicio?: number, fim?: number) => Readable.toWeb(createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const inicio = range[1] ? Number(range[1]) : Math.max(0, tamanho - Number(range[2]));
    const fim = range[1] && range[2] ? Math.min(Number(range[2]), tamanho - 1) : tamanho - 1;
    if (inicio > fim || inicio >= tamanho) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    return new Response(stream(inicio, fim), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }
  return new Response(stream(), { headers: { ...headers, "Content-Length": String(tamanho) } });
}
