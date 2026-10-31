import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { baixarNaFila } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { listarVideos } from "@/lib/videos-lista";

/** Situação dos vídeos (?ids=1,2): a tela pergunta só pelos que ainda estão convertendo. */
export async function GET(req: Request) {
  await requireUser();
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0).slice(0, 100);
  return Response.json(await listarVideos(ids));
}

/** Coloca os links na fila de conversão e devolve os vídeos criados. */
export async function POST(req: Request) {
  await requireUser();
  const corpo = (await req.json().catch(() => null)) as { links?: string; produtoId?: number } | null;
  const links = [...new Set((String(corpo?.links ?? "").match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((l) => l.replace(/[),.]+$/, "")))].slice(0, 30);
  if (!links.length) return Response.json({ erro: "Cole o link do vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...)." }, { status: 400 });
  const produtoId = Number(corpo?.produtoId) || null;
  const ids: number[] = [];
  for (const url of links) {
    const [v] = await db.insert(afiliadosVideos).values({ produtoId, urlOrigem: url, origem: "outro", status: "baixando" }).returning({ id: afiliadosVideos.id });
    ids.push(v!.id);
    baixarNaFila(v!.id, url);
  }
  return Response.json(await listarVideos(ids));
}
