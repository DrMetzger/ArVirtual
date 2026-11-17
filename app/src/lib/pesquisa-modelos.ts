import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pesquisaModelosItens, pesquisasModelos, type CanalMercado, type DetalheModelo, type MercadoCanal } from "@/db/schema";
import { pesquisarConcorrencia, resumir, type Anuncio } from "@/lib/concorrencia";
import { tempoPeloPeso } from "@/lib/cores-filamento";
import { custoComposicao } from "@/lib/impressao";
import { buscarModelosDetalhado, lerModeloDoLink } from "@/lib/modelos3d";
import { liquido, precosPorCanal } from "@/lib/precificacao";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";

// Pesquisa de mercado de modelos 3D: acha os modelos (todas as licenças) e, um por vez em segundo plano, calcula
// peso/tempo/custo e o mercado de cada um no Mercado Livre, na Shopee e no Magalu, com o preço para concorrer.

const CANAIS: CanalMercado[] = ["magalu", "mercadolivre", "shopee"];
const MAX_MODELOS = 48;

export async function criarPesquisa(termo: string) {
  const q = termo.trim().slice(0, 80);
  if (q.length < 2) throw new Error("Digite o que procurar.");
  const { modelos, fontes } = await buscarModelosDetalhado(q, MAX_MODELOS);
  if (!modelos.length) throw new Error(`Nada encontrado para “${q}”. Tente outras palavras.`);
  const [p] = await db.insert(pesquisasModelos).values({ termo: q, fontes }).returning();
  await db.insert(pesquisaModelosItens).values(modelos.map((modelo, posicao) => ({ pesquisaId: p!.id, posicao, modelo })));
  void analisarPendentes();
  return p!.id;
}

/** Preço "bonito" um pouco abaixo da mediana (ex.: 31,90). */
const abaixoDe = (v: number) => Math.max(0, Math.floor(v * 0.97) - 0.1);

async function analisarItem(id: number) {
  const [item] = await db.select().from(pesquisaModelosItens).where(eq(pesquisaModelosItens.id, id));
  if (!item) return;
  const [pi, pp] = await Promise.all([getParametrosImpressao(), getParametrosPreco()]);
  // 1) Peso, tempo e cores pelo perfil (MakerWorld) ou medindo o arquivo (Printables).
  let detalhe: DetalheModelo = { pesoG: 0, tempoMin: 0, cores: 1, custo: 0, estimado: true, medidasMm: null };
  try {
    const m = await lerModeloDoLink(item.modelo.link);
    const perfil = m.perfis[0];
    const peso = perfil?.pesoG || m.pesoEstimadoG || 0;
    const tempo = perfil?.tempoMin || tempoPeloPeso(peso);
    detalhe = {
      pesoG: peso,
      tempoMin: tempo,
      cores: perfil ? Math.max(1, new Set(perfil.filamentos.map((f) => f.cor)).size) : 1,
      custo: peso ? custoComposicao([{ filamentoId: null, gramas: peso }], tempo, pi, []).custo : 0,
      estimado: !perfil?.pesoG,
      medidasMm: m.medidasMm,
    };
  } catch {
    /* sem peso: o mercado sai mesmo assim, sem o preço para concorrer */
  }
  // 2) Mercado nas plataformas pelo título em português.
  const r = await pesquisarConcorrencia(item.modelo.titulo);
  const sugeridos = detalhe.custo > 0 ? precosPorCanal(detalhe.custo, 0, pp) : [];
  const mercado: Partial<Record<CanalMercado, MercadoCanal>> = {};
  for (const c of CANAIS) {
    const lista: Anuncio[] = r[c];
    const res = resumir(lista, c === "shopee");
    const s = sugeridos.find((x) => x.canal === c);
    let concorrer: number | null = null;
    let lucro: number | null = null;
    if (res.mediana > 0 && s && detalhe.custo > 0) {
      const alvo = Math.round(Math.max(abaixoDe(res.mediana), s.minimo) * 100) / 100;
      const l = liquido(alvo, detalhe.custo, pp.canais[c], pp);
      // Só "concorre" se ainda sobra lucro no preço da disputa.
      if (l.lucro > 0 && alvo <= res.mediana) {
        concorrer = alvo;
        lucro = l.lucro;
      }
    }
    mercado[c] = {
      anuncios: res.anuncios,
      vendedores: res.vendedores,
      min: res.min,
      mediana: res.mediana,
      max: res.max,
      vendas: res.vendas,
      concorrer,
      lucro,
      minimo: s?.minimo ?? 0,
      sugerido: s?.sugerido ?? 0,
      top: lista.slice(0, 3).map((a) => ({ produto: a.produto.slice(0, 120), preco: a.preco, vendas: a.vendas, link: a.link, vendedor: a.vendedor })),
    };
  }
  const erro = r.erros.filter((e) => !/Filtro da IA/.test(e)).join(" · ").slice(0, 300);
  await db.update(pesquisaModelosItens).set({ detalhe, mercado, status: "pronto", erro, atualizadoEm: new Date() }).where(eq(pesquisaModelosItens.id, id));
}

const g = globalThis as unknown as { analisandoModelos?: boolean };

/** Analisa os modelos pendentes, um por vez (as pesquisas mais novas primeiro). */
export async function analisarPendentes() {
  if (g.analisandoModelos) return;
  g.analisandoModelos = true;
  try {
    for (;;) {
      const [proximo] = await db
        .select({ id: pesquisaModelosItens.id })
        .from(pesquisaModelosItens)
        .where(eq(pesquisaModelosItens.status, "pendente"))
        .orderBy(desc(pesquisaModelosItens.pesquisaId), asc(pesquisaModelosItens.posicao))
        .limit(1);
      if (!proximo) break;
      try {
        await analisarItem(proximo.id);
      } catch (e) {
        await db
          .update(pesquisaModelosItens)
          .set({ status: "erro", erro: (e as Error).message.slice(0, 300), atualizadoEm: new Date() })
          .where(eq(pesquisaModelosItens.id, proximo.id));
      }
    }
  } finally {
    g.analisandoModelos = false;
  }
}

/** Analisa de novo um modelo (ex.: deu erro na plataforma). */
export async function reanalisar(itemId: number) {
  await db.update(pesquisaModelosItens).set({ status: "pendente", erro: "" }).where(eq(pesquisaModelosItens.id, itemId));
  void analisarPendentes();
}

export async function listaPesquisas() {
  return db.select().from(pesquisasModelos).orderBy(desc(pesquisasModelos.criadoEm)).limit(30);
}

export async function itensDaPesquisa(pesquisaId: number) {
  return db.select().from(pesquisaModelosItens).where(and(eq(pesquisaModelosItens.pesquisaId, pesquisaId))).orderBy(asc(pesquisaModelosItens.posicao));
}
