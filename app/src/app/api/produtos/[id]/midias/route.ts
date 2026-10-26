import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/uploads";
import { criarZip } from "@/lib/zip";

/** Baixa as fotos (?tipo=imagens) ou os vídeos (?tipo=videos) do produto num .zip, na ordem do cadastro. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") === "videos" ? "videos" : "imagens";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrado", { status: 404 });
  const p = await db.query.produtos.findFirst({ where: eq(produtos.id, id), columns: { sku: true, imagens: true, videos: true } });
  if (!p) return new Response("Não encontrado", { status: 404 });
  const arquivos = [];
  for (const [i, url] of p[tipo].entries()) {
    const nome = url.split("/").pop() ?? "";
    if (!/^[a-z0-9-]+\.(jpg|png|webp|mp4)$/.test(nome)) continue;
    const dados = await readFile(`${UPLOAD_DIR}/${nome}`).catch(() => null);
    if (dados) arquivos.push({ nome: `${p.sku}-${String(i + 1).padStart(2, "0")}.${nome.split(".").pop()}`, dados });
  }
  if (!arquivos.length) return new Response("Nada para baixar.", { status: 404 });
  const zip = criarZip(arquivos);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${p.sku.replace(/[^\w.-]/g, "_")}-${tipo === "videos" ? "videos" : "fotos"}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
