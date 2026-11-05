import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { importarProduto } from "@/lib/importar-produto";
import type { DadosImportados } from "@/lib/marketplaces/types";

// Importa um produto pelo link e vai mandando cada etapa (uma linha JSON por evento) para a barra de progresso.
export async function POST(req: Request) {
  await requireUser();
  const { link, dados } = ((await req.json().catch(() => null)) ?? {}) as { link?: string; dados?: Partial<DadosImportados> };
  const url = String(link ?? "").trim().match(/https?:\/\/\S+/)?.[0];
  if (!url) return Response.json({ erro: "Cole o link do produto." }, { status: 400 });
  // Dados lidos no navegador do usuário: só texto e URLs http(s), com limites.
  const http = (u: unknown) => typeof u === "string" && /^https?:\/\//.test(u);
  const daPagina: DadosImportados | undefined =
    dados && typeof dados.titulo === "string" && dados.titulo.trim()
      ? {
          titulo: dados.titulo.trim().slice(0, 300),
          descricao: String(dados.descricao ?? "").slice(0, 8000),
          fotos: (Array.isArray(dados.fotos) ? dados.fotos : []).filter(http).slice(0, 20) as string[],
          videos: (Array.isArray(dados.videos) ? dados.videos : []).filter(http).slice(0, 3) as string[],
          preco: Number(dados.preco) > 0 ? Number(dados.preco) : undefined,
          gtin: typeof dados.gtin === "string" ? dados.gtin.replace(/\D/g, "").slice(0, 14) || undefined : undefined,
          link: url,
        }
      : undefined;
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(ctrl) {
      const enviar = (o: unknown) => ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      try {
        const it = importarProduto(url, origin, daPagina);
        for (;;) {
          const r = await it.next();
          if (r.done) {
            revalidatePath("/produtos");
            enviar({ fim: r.value });
            break;
          }
          enviar({ passo: r.value });
        }
      } catch (e) {
        enviar({ erro: (e as Error).message });
      }
      ctrl.close();
    },
  });
  return new Response(corpo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
