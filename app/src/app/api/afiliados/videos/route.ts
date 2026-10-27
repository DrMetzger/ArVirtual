import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { duracaoVideo } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { MAX_VIDEO_AFILIADO, PASTA_AFILIADOS } from "@/lib/uploads";

const EXTENSOES = ["mp4", "mov", "webm", "m4v"];

/** Envia um vídeo do computador para a biblioteca do produto (?produto=<id>). Corpo = o arquivo; nome em x-nome. */
export async function POST(req: Request) {
  await requireUser();
  const produtoId = Number(new URL(req.url).searchParams.get("produto"));
  if (!produtoId || !(await db.query.afiliadosProdutos.findFirst({ where: eq(afiliadosProdutos.id, produtoId), columns: { id: true } }))) {
    return Response.json({ erro: "Produto não encontrado." }, { status: 404 });
  }
  const nome = decodeURIComponent(req.headers.get("x-nome") ?? "").slice(0, 200);
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (!EXTENSOES.includes(ext)) return Response.json({ erro: `${nome || "Arquivo"}: envie MP4, MOV ou WEBM.` }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_VIDEO_AFILIADO) return Response.json({ erro: `${nome} passa de 300 MB.` }, { status: 413 });
  if (!req.body) return Response.json({ erro: "Arquivo vazio." }, { status: 400 });

  await mkdir(PASTA_AFILIADOS, { recursive: true });
  const arquivo = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  const caminho = `${PASTA_AFILIADOS}/${arquivo}`;
  let recebido = 0;
  const limite = new Transform({
    transform(parte: Buffer, _enc, pronto) {
      recebido += parte.length;
      pronto(recebido > MAX_VIDEO_AFILIADO ? new Error(`${nome} passa de 300 MB.`) : null, parte);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as WebReadableStream), limite, createWriteStream(caminho));
  } catch (e) {
    await rm(caminho, { force: true });
    return Response.json({ erro: (e as Error).message }, { status: 400 });
  }
  const [v] = await db
    .insert(afiliadosVideos)
    .values({
      produtoId,
      titulo: nome.replace(/\.[^.]+$/, ""),
      origem: "proprio",
      arquivo,
      tamanho: (await stat(caminho)).size,
      duracaoS: await duracaoVideo(caminho),
      status: "bruto",
    })
    .returning();
  return Response.json({ video: v });
}
