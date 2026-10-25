import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { UPLOAD_DIR } from "@/lib/uploads";

const TIPOS: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" };

// Imagens e vídeos de produto são públicos: os marketplaces precisam baixá-los.
// Responde a pedidos com Range (o player de vídeo avança/volta pedindo pedaços do arquivo).
export async function GET(req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp|mp4)$/.test(nome)) return new Response("Não encontrado", { status: 404 });
  const caminho = `${UPLOAD_DIR}/${nome}`;
  let tamanho: number;
  try {
    tamanho = (await stat(caminho)).size;
  } catch {
    return new Response("Não encontrado", { status: 404 });
  }
  const headers = {
    "Content-Type": TIPOS[nome.split(".").pop() ?? ""] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  const stream = (inicio?: number, fim?: number) =>
    Readable.toWeb(createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const inicio = range[1] ? Number(range[1]) : Math.max(0, tamanho - Number(range[2]));
    const fim = range[1] && range[2] ? Math.min(Number(range[2]), tamanho - 1) : tamanho - 1;
    if (inicio > fim || inicio >= tamanho) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    }
    return new Response(stream(inicio, fim), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }
  return new Response(stream(), { headers: { ...headers, "Content-Length": String(tamanho) } });
}
