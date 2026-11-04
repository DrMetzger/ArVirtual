import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { importarProduto } from "@/lib/importar-produto";

// Importa um produto pelo link e vai mandando cada etapa (uma linha JSON por evento) para a barra de progresso.
export async function POST(req: Request) {
  await requireUser();
  const { link } = ((await req.json().catch(() => null)) ?? {}) as { link?: string };
  const url = String(link ?? "").trim().match(/https?:\/\/\S+/)?.[0];
  if (!url) return Response.json({ erro: "Cole o link do produto." }, { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(ctrl) {
      const enviar = (o: unknown) => ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      try {
        const it = importarProduto(url, origin);
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
