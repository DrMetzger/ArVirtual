import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
import { adapter, contaComToken } from "@/lib/marketplaces";

// Publicações que a plataforma aceitou mas ainda está criando (Magalu): o ERP confere sozinho e, quando o cadastro
// existir, manda o preço e o estoque e marca como publicado. Sem nenhum clique.

const g = globalThis as unknown as { acompanhando?: boolean };

/** Uma rodada: termina o que já dá; depois de 24 h sem o cadastro, vira erro com a explicação. */
export async function concluirPendentes() {
  const lista = await db
    .select({ id: anuncios.id, contaId: anuncios.contaId, idExterno: anuncios.idExterno, preco: anuncios.preco, criadoEm: anuncios.criadoEm, estoque: produtos.estoque })
    .from(anuncios)
    .innerJoin(produtos, eq(produtos.id, anuncios.produtoId))
    .where(eq(anuncios.status, "processando"));
  let faltam = 0;
  for (const a of lista) {
    const conta = a.contaId ? await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, a.contaId) }) : null;
    const ad = conta ? adapter(conta.marketplace) : null;
    if (!conta || !ad?.concluir || !a.idExterno) continue;
    try {
      const pronto = await ad.concluir(await contaComToken(conta), a.idExterno, a.preco, a.estoque);
      if (pronto) {
        await db.update(anuncios).set({ status: "publicado", mensagem: "Publicado: a plataforma terminou o cadastro e o ERP mandou o preço e o estoque." }).where(eq(anuncios.id, a.id));
        continue;
      }
    } catch (e) {
      await db.update(anuncios).set({ mensagem: `Ainda processando (última tentativa: ${(e as Error).message.slice(0, 200)})` }).where(eq(anuncios.id, a.id));
    }
    faltam++;
  }
  // 24 h sem o cadastro aparecer: não fica "processando" para sempre.
  await db
    .update(anuncios)
    .set({ status: "erro", mensagem: "A plataforma não terminou o cadastro em 24 h: confira no portal dela (pode ter sido recusado na análise)." })
    .where(and(eq(anuncios.status, "processando"), lt(anuncios.criadoEm, new Date(Date.now() - 24 * 3600_000))));
  return faltam;
}

/** Depois de publicar: confere a cada 2 minutos por até 1 hora (a rotina de 15 em 15 minutos cobre o resto). */
export async function acompanharPendentes() {
  if (g.acompanhando) return;
  g.acompanhando = true;
  try {
    for (let i = 0; i < 30; i++) {
      await new Promise((ok) => setTimeout(ok, 2 * 60_000));
      if (!(await concluirPendentes().catch(() => 1))) break;
    }
  } finally {
    g.acompanhando = false;
  }
}
