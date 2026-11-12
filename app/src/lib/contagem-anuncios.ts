import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { anunciosPlataforma, contasMarketplace } from "@/db/schema";
import { adapter, contaComToken } from "@/lib/marketplaces";

/**
 * Conta os anúncios direto em cada plataforma (todas as contas conectadas), não só os cadastrados no ERP:
 * é o número que o algoritmo de cada marketplace enxerga. Guarda por conta, para o dashboard abrir na hora.
 */
let rodando = false;
export async function contarAnunciosPlataformas() {
  if (rodando) return;
  rodando = true;
  try {
    const contas = await db.select().from(contasMarketplace);
    for (const c of contas) {
      let valores = { ativos: 0, pausados: 0, outros: 0, erro: "" };
      try {
        const lista = await adapter(c.marketplace).anuncios(await contaComToken(c));
        for (const a of lista) {
          if (a.status === "ativo") valores.ativos++;
          else if (a.status === "pausado") valores.pausados++;
          else valores.outros++;
        }
      } catch (e) {
        // Falhou agora: mantém a última contagem boa e registra o motivo.
        valores = { ...valores, erro: (e as Error).message.slice(0, 300) };
        // Só anota o erro em contagem que já existe (sem contagem boa, o dashboard segue com o número do ERP).
        await db.update(anunciosPlataforma).set({ erro: valores.erro }).where(eq(anunciosPlataforma.contaId, c.id));
        console.warn(`[contagem-anuncios] ${c.marketplace} ${c.nome}: ${valores.erro}`);
        continue;
      }
      await db
        .insert(anunciosPlataforma)
        .values({ contaId: c.id, marketplace: c.marketplace, ...valores, em: new Date() })
        .onConflictDoUpdate({ target: anunciosPlataforma.contaId, set: { ...valores, erro: "", em: new Date() } });
    }
  } finally {
    rodando = false;
  }
}

/** Totais por marketplace (somando as contas) e quando foi a última contagem. */
export async function anunciosPorPlataforma() {
  const linhas = await db.execute<{ marketplace: string; ativos: number; pausados: number; outros: number; contas: number; em: Date | null; erro: string }>(sql`
    select marketplace, sum(ativos)::int as ativos, sum(pausados)::int as pausados, sum(outros)::int as outros,
      count(*)::int as contas, min(em) as em, string_agg(nullif(erro, ''), ' · ') as erro
    from ${anunciosPlataforma} group by marketplace`);
  return new Map([...linhas].map((l) => [l.marketplace, l]));
}

let ultima = 0;
/** Na sincronização automática: recontagem a cada 6 horas. */
export async function rotinaContagemAnuncios() {
  if (Date.now() - ultima < 6 * 3600_000) return;
  ultima = Date.now();
  await contarAnunciosPlataformas();
}
