import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
import { adapter, contaComToken } from "@/lib/marketplaces";

// Publicações que a plataforma aceitou mas ainda está criando (Magalu): o ERP confere sozinho e, quando o cadastro
// existir, manda o preço e o estoque e marca como publicado. Sem nenhum clique.

const g = globalThis as unknown as { acompanhando?: boolean };

/** Uma rodada: termina o que já dá e guarda o motivo do que a plataforma ainda não aprovou. */
export async function concluirPendentes() {
  const lista = await db
    .select({ id: anuncios.id, contaId: anuncios.contaId, idExterno: anuncios.idExterno, preco: anuncios.preco, produtoId: anuncios.produtoId })
    .from(anuncios)
    .where(eq(anuncios.status, "processando"));
  let faltam = 0;
  for (const a of lista) {
    const conta = a.contaId ? await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, a.contaId) }) : null;
    const ad = conta ? adapter(conta.marketplace) : null;
    if (!conta || !ad?.concluir || !a.idExterno) continue;
    const produto = (await db.query.produtos.findFirst({ where: eq(produtos.id, a.produtoId) })) ?? null;
    try {
      const r = await ad.concluir(await contaComToken(conta), a.idExterno, a.preco, produto?.estoque ?? 0, produto);
      if (r.pronto) {
        await db
          .update(anuncios)
          .set({ status: "publicado", ...(r.link ? { link: r.link } : {}), mensagem: "Publicado: aprovado pela plataforma.", atualizadoEm: new Date() })
          .where(eq(anuncios.id, a.id));
        continue;
      }
      if (r.mensagem) await db.update(anuncios).set({ mensagem: r.mensagem.slice(0, 2000), atualizadoEm: new Date() }).where(eq(anuncios.id, a.id));
    } catch (e) {
      await db.update(anuncios).set({ mensagem: `Ainda processando (última conferência: ${(e as Error).message.slice(0, 200)})` }).where(eq(anuncios.id, a.id));
    }
    faltam++;
  }
  // Fica "processando" com o último motivo da plataforma até ser aprovado (a rotina confere a cada 15 min).
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
