import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { arquivosProduto, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { EXTENSOES_IMPRESSAO, MAX_ARQUIVO_IMPRESSAO, PASTA_IMPRESSAO } from "@/lib/uploads";

/**
 * Envia um arquivo de impressão do produto. O corpo é o próprio arquivo (sem formulário), gravado direto no disco
 * enquanto chega: arquivos 3MF grandes não passam pela memória. Nome original no cabeçalho x-nome.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ erro: "Produto inválido." }, { status: 404 });
  const produto = await db.query.produtos.findFirst({ where: eq(produtos.id, id), columns: { id: true } });
  if (!produto) return Response.json({ erro: "Produto não encontrado." }, { status: 404 });

  const nome = decodeURIComponent(req.headers.get("x-nome") ?? "").replace(/[\\/\0]/g, "_").trim().slice(0, 200);
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (!nome || !EXTENSOES_IMPRESSAO.includes(ext)) {
    return Response.json({ erro: `${nome || "Arquivo"}: formato não aceito. Use ${EXTENSOES_IMPRESSAO.map((e) => e.toUpperCase()).join(", ")}.` }, { status: 400 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ARQUIVO_IMPRESSAO) {
    return Response.json({ erro: `${nome} passa de 150 MB.` }, { status: 413 });
  }
  if (!req.body) return Response.json({ erro: "Arquivo vazio." }, { status: 400 });

  await mkdir(PASTA_IMPRESSAO, { recursive: true });
  const arquivo = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  const caminho = `${PASTA_IMPRESSAO}/${arquivo}`;
  let recebido = 0;
  const limite = new Transform({
    transform(parte: Buffer, _enc, pronto) {
      recebido += parte.length;
      pronto(recebido > MAX_ARQUIVO_IMPRESSAO ? new Error(`${nome} passa de 150 MB.`) : null, parte);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as WebReadableStream), limite, createWriteStream(caminho));
  } catch (e) {
    await rm(caminho, { force: true });
    return Response.json({ erro: (e as Error).message }, { status: 400 });
  }
  const tamanho = (await stat(caminho)).size;
  if (!tamanho) {
    await rm(caminho, { force: true });
    return Response.json({ erro: "Arquivo vazio." }, { status: 400 });
  }
  const [salvo] = await db.insert(arquivosProduto).values({ produtoId: id, nome, arquivo, tamanho, enviadoPor: user.nome }).returning();
  return Response.json({ arquivo: salvo });
}
