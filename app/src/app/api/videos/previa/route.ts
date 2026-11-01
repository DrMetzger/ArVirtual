import { previaVideo } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";

/** Acha o vídeo de cada link (sem baixar) para a tela mostrar "é este?" antes de converter. */
export async function POST(req: Request) {
  await requireUser();
  const corpo = (await req.json().catch(() => null)) as { links?: string } | null;
  const links = [...new Set((String(corpo?.links ?? "").match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((l) => l.replace(/[),.]+$/, "")))].slice(0, 10);
  if (!links.length) return Response.json({ erro: "Cole o link do vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...)." }, { status: 400 });
  const previas = [];
  for (const l of links) previas.push(await previaVideo(l));
  return Response.json(previas);
}
