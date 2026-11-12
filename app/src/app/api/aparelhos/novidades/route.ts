import { cookies, headers } from "next/headers";
import { aparelhoBloqueado, registrarAparelho, type InfoAparelho } from "@/lib/aparelhos";
import { avisosPedidos, pedidosNovos } from "@/lib/aparelhos-pedidos";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Consulta do app Android em segundo plano (a cada ~15 min, mesmo fechado): pedidos novos desde a última vez,
 * para virar notificação. Também atualiza bateria e último acesso do aparelho.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as (InfoAparelho & { desde?: number; esperar?: boolean }) | null;
  if (!corpo?.id) return Response.json({ erro: "Dados inválidos." }, { status: 400 });
  if (await aparelhoBloqueado(corpo.id)) return Response.json({ bloqueado: true, pedidos: [] }, { status: 403 });
  const sessao = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!sessao) return Response.json({ semLogin: true, pedidos: [] }, { status: 401 });
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const { desde, esperar, ...info } = corpo;
  await registrarAparelho(info, sessao, ip).catch(() => undefined);
  const inicio = Number(desde) > 0 ? new Date(Math.max(Number(desde), Date.now() - 2 * 86400_000)) : new Date();
  const agora = Date.now();
  let pedidos = await pedidosNovos(inicio);
  // App conectado (serviço do celular): segura a resposta até 45 s e responde no mesmo segundo em que entra pedido.
  if (esperar && Number(desde) > 0 && !pedidos.length) {
    const fim = Date.now() + 45_000;
    while (!pedidos.length && Date.now() < fim && !req.signal.aborted) {
      await new Promise<void>((ok) => {
        const t = setTimeout(fim0, 5_000);
        function fim0() {
          clearTimeout(t);
          avisosPedidos.off("novos", fim0);
          ok();
        }
        avisosPedidos.once("novos", fim0);
      });
      pedidos = await pedidosNovos(inicio);
    }
  }
  return Response.json({ agora: pedidos.length ? Date.now() : agora, pedidos });
}
