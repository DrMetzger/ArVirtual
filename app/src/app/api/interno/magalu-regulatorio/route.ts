import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, raioxAnuncios } from "@/db/schema";
import { chamadaInterna } from "@/lib/interno";
import { contaComToken } from "@/lib/marketplaces";
import { sondarScores } from "@/lib/marketplaces/magalu";
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
    const contas = await db.query.contasMarketplace.findMany({ where: eq(contasMarketplace.marketplace, "magalu") });
    const score: Record<string, string> = {};
    for (const c of contas) score[`conta ${c.id}`] = await contaComToken(c).then(sondarScores, (e: Error) => `token: ${e.message.slice(0, 100)}`);
    raiox = { magaluComNota: r?.n ?? 0, score };
  }
  return Response.json({ regulatorio, raiox });
}
