import { readFile } from "node:fs/promises";
import { NOME_ARQUIVO_IA, PASTA_IA } from "@/lib/assistente/arquivos";
import { requireUser } from "@/lib/auth";

const TIPOS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

// Anexos e imagens do assistente: só para quem está logado.
export async function GET(req: Request, { params }: { params: Promise<{ nome: string }> }) {
  await requireUser();
  const { nome } = await params;
  if (!NOME_ARQUIVO_IA.test(nome)) return new Response("Não encontrado", { status: 404 });
  const dados = await readFile(`${PASTA_IA}/${nome}`).catch(() => null);
  if (!dados) return new Response("Não encontrado", { status: 404 });
  const url = new URL(req.url);
  const ext = nome.split(".").pop() ?? "";
  const baixar = url.searchParams.get("baixar");
  return new Response(new Uint8Array(dados), {
    headers: {
      "Content-Type": TIPOS[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(baixar || !TIPOS[ext] ? { "Content-Disposition": `attachment; filename="${(baixar || nome).replace(/[^\w.\- ]/g, "_")}"` } : {}),
    },
  });
}
