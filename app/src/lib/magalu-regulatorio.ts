import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace } from "@/db/schema";
import { contaComToken } from "@/lib/marketplaces";
import { corrigirRegulatorio } from "@/lib/marketplaces/magalu";

// Anúncios do Magalu já existentes: Anvisa, MAPA, Anatel e afins vão "Não se aplica" sozinhos (peça impressa em 3D).
// Roda a cada 6 h; só mexe no SKU quando falta algum desses campos.

const g = globalThis as unknown as { regulatorioMagaluEm?: number };

export async function rotinaRegulatorioMagalu(forcar = false, soVer = false) {
  if (!forcar && Date.now() - (g.regulatorioMagaluEm ?? 0) < 6 * 3600_000) return null;
  g.regulatorioMagaluEm = Date.now();
  const contas = await db.query.contasMarketplace.findMany({ where: eq(contasMarketplace.marketplace, "magalu") });
  const saida: Record<string, unknown> = {};
  for (const c of contas) {
    const lista = await db
      .select({ sku: anuncios.idExterno })
      .from(anuncios)
      .where(and(eq(anuncios.contaId, c.id), isNotNull(anuncios.idExterno), inArray(anuncios.status, ["publicado", "processando", "pausado"])));
    const skus = [...new Set(lista.map((l) => l.sku!).filter(Boolean))];
    if (!skus.length) continue;
    try {
      saida[`conta ${c.id}`] = await corrigirRegulatorio(await contaComToken(c), soVer ? skus.slice(0, 5) : skus, soVer);
    } catch (e) {
      saida[`conta ${c.id}`] = { erro: (e as Error).message.slice(0, 200) };
    }
  }
  return saida;
}
