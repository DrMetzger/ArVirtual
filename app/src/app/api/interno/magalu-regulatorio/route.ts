import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { raioxAnuncios } from "@/db/schema";
import { chamadaInterna } from "@/lib/interno";
import { rotinaRegulatorioMagalu } from "@/lib/magalu-regulatorio";
import { coletarRaioX } from "@/lib/raiox";

// Conferência/correção sob demanda dos campos regulatórios do Magalu (só nomes de campos e situação; nada sigiloso).
export async function POST(req: Request) {
  if (!chamadaInterna(req)) return Response.json({ erro: "Não autorizado" }, { status: 401 });
  const u = new URL(req.url);
  const soVer = u.searchParams.get("ver") === "1";
  const regulatorio = await rotinaRegulatorioMagalu(true, soVer);
  let raiox: unknown = null;
  if (u.searchParams.get("raiox") === "1") {
    await coletarRaioX().catch(() => undefined);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(raioxAnuncios)
      .where(and(eq(raioxAnuncios.marketplace, "magalu"), isNotNull(raioxAnuncios.qualidade)));
    raiox = { magaluComNota: r?.n ?? 0 };
  }
  return Response.json({ regulatorio, raiox });
}
