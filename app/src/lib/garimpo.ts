import "server-only";
import { asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { garimpoItens, garimpoLeituras, garimpoTermos } from "@/db/schema";
import { afiliadosConfigurado, buscarOfertas, type Oferta } from "@/lib/afiliados";

/**
 * Garimpo de afiliados (só Shopee, separado do Sentinela de impressão 3D).
 * A cada 4 h lê a lista "em alta" (o que os afiliados mais vendem agora) e os seus termos, como você escreveu,
 * e guarda cada leitura: a diferença entre leituras dá as vendas por dia.
 */

export const EM_ALTA = "em alta";
let rodando = false;

/**
 * Afiliados divulgando: a Shopee NÃO informa esse número (nem na API, nem na página do produto).
 * Estimativa por faixa, a partir do que puxa afiliado para um produto: vendas, há quanto tempo a oferta existe e a comissão.
 */
export function afiliadosEstimados(i: { vendas: number; comissao: number; extras?: { ofertaDesde?: string } | null }) {
  const dias = i.extras?.ofertaDesde ? Math.max(0, (Date.now() - new Date(i.extras.ofertaDesde).getTime()) / 86400_000) : 60;
  const base = Math.sqrt(Math.max(0, i.vendas)) * (0.4 + Math.min(dias, 180) / 90) * (0.6 + Math.min(i.comissao, 0.5) * 4);
  const meio = Math.max(1, Math.round(base / 2));
  return { de: Math.max(1, Math.round(meio * 0.6)), ate: Math.max(2, Math.round(meio * 1.5)), nivel: meio <= 5 ? "baixa" : meio <= 25 ? "média" : "alta" };
}

async function gravar(ofertas: Oferta[], termo: string) {
  const unicos = [...new Map(ofertas.map((o) => [o.itemId, o])).values()];
  if (!unicos.length) return [];
  const salvos = await db
    .insert(garimpoItens)
    .values(
      unicos.map((o) => ({
        itemId: o.itemId,
        lojaId: o.shopId,
        termo,
        nome: o.nome.slice(0, 300),
        imagem: o.imagem,
        link: o.linkProduto,
        loja: o.loja,
        preco: o.preco || 0,
        comissao: o.comissaoTaxa,
        vendas: o.vendas,
        avaliacao: o.avaliacao,
        extras: {
          comissaoVendedor: o.comissaoVendedor,
          comissaoShopee: o.comissaoShopee,
          comissaoNovo: o.comissaoNovo,
          ofertaDesde: o.ofertaDesde,
          ofertaAte: o.ofertaAte,
          tiposLoja: o.tiposLoja,
          desconto: o.desconto,
          categorias: o.categorias,
        },
      })),
    )
    .onConflictDoUpdate({
      target: garimpoItens.itemId,
      set: {
        nome: sql`excluded.nome`,
        imagem: sql`case when excluded.imagem <> '' then excluded.imagem else ${garimpoItens.imagem} end`,
        link: sql`excluded.link`,
        loja: sql`excluded.loja`,
        preco: sql`excluded.preco`,
        comissao: sql`excluded.comissao`,
        vendas: sql`excluded.vendas`,
        avaliacao: sql`excluded.avaliacao`,
        extras: sql`excluded.extras`,
        // Termo seu tem prioridade sobre a lista "em alta" (para o filtro por termo funcionar).
        termo: sql`case when excluded.termo = ${EM_ALTA} then ${garimpoItens.termo} else excluded.termo end`,
        vistoEm: sql`now()`,
      },
    })
    .returning({ id: garimpoItens.id, itemId: garimpoItens.itemId });
  const porItem = new Map(unicos.map((o) => [o.itemId, o]));
  await db.insert(garimpoLeituras).values(salvos.map((s) => ({ itemId: s.id, vendas: porItem.get(s.itemId)!.vendas, preco: porItem.get(s.itemId)!.preco || 0, comissao: porItem.get(s.itemId)!.comissaoTaxa })));
  return salvos.map((s) => s.id);
}

async function recalcularVelocidade(ids: number[]) {
  if (!ids.length) return;
  await db.execute(sql`
    with janela as (
      select l.item_id, (array_agg(l.vendas order by l.em asc))[1] as ini, (array_agg(l.vendas order by l.em desc))[1] as fim,
        extract(epoch from max(l.em) - min(l.em)) / 86400.0 as dias
      from ${garimpoLeituras} l where l.item_id in ${ids} and l.em > now() - interval '7 days' group by l.item_id
    )
    update ${garimpoItens} i set velocidade = case when j.dias < 0.25 then 0 else greatest(0, j.fim - j.ini) / j.dias end
    from janela j where j.item_id = i.id`);
}

export async function coletarGarimpo() {
  if (rodando) return { itens: 0, erros: ["Já existe um garimpo em andamento."] };
  if (!(await afiliadosConfigurado())) return { itens: 0, erros: ["Cadastre a API de afiliados da Shopee em Configurações."] };
  rodando = true;
  const erros: string[] = [];
  const ids: number[] = [];
  try {
    // 1) O que os afiliados mais vendem agora (todas as categorias).
    for (let pagina = 1; pagina <= 6; pagina++) {
      const r = await buscarOfertas({ lista: 2, pagina, limite: 50 }).catch((e: Error) => (erros.push(`em alta: ${e.message}`), null));
      if (!r) break;
      ids.push(...(await gravar(r.ofertas, EM_ALTA)));
      if (!r.temMais) break;
    }
    // 2) Os seus termos, como você escreveu (mais vendidos primeiro; se a Shopee recusar a ordem, relevância).
    const termos = await db.select().from(garimpoTermos).where(eq(garimpoTermos.ativo, true)).orderBy(sql`${garimpoTermos.ultimaColeta} asc nulls first`).limit(40);
    for (const t of termos) {
      for (let pagina = 1; pagina <= 2; pagina++) {
        const r =
          (await buscarOfertas({ termo: t.termo, ordem: "vendidos", pagina, limite: 50 }).catch(() => null)) ??
          (await buscarOfertas({ termo: t.termo, pagina, limite: 50 }).catch((e: Error) => (erros.push(`"${t.termo}": ${e.message}`), null)));
        if (!r) break;
        ids.push(...(await gravar(r.ofertas, t.termo)));
        if (!r.temMais) break;
      }
    }
    if (termos.length) await db.update(garimpoTermos).set({ ultimaColeta: new Date() }).where(inArray(garimpoTermos.id, termos.map((t) => t.id)));
    await recalcularVelocidade([...new Set(ids)]);
    await db.delete(garimpoLeituras).where(lt(garimpoLeituras.em, new Date(Date.now() - 60 * 86400_000)));
    return { itens: ids.length, erros };
  } finally {
    rodando = false;
  }
}

let ultima = 0;
export async function rotinaGarimpo() {
  if (Date.now() - ultima < 4 * 3600_000) return;
  ultima = Date.now();
  const r = await coletarGarimpo();
  if (r.erros.length) console.warn(`[garimpo] ${r.erros.slice(0, 5).join(" | ")}`);
}

export async function termosGarimpo() {
  return db.select().from(garimpoTermos).orderBy(asc(garimpoTermos.termo));
}
