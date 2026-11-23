import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pesquisaModelosItens, pesquisasModelos, type DetalheModelo } from "@/db/schema";
import { pesquisarConcorrencia } from "@/lib/concorrencia";
import { calcularMercado } from "@/lib/preco-mercado";
import { tempoPeloPeso } from "@/lib/cores-filamento";
import { custoComposicao } from "@/lib/impressao";
import { buscarModelosDetalhado, lerModeloDoLink } from "@/lib/modelos3d";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";

// Pesquisa de mercado de modelos 3D: acha os modelos (todas as licenças) e, um por vez em segundo plano, calcula
// peso/tempo/custo e o mercado de cada um no Mercado Livre, na Shopee e no Magalu, com o preço para concorrer.

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
  // 2) Mercado nas plataformas pelo título em português (preço para concorrer pela regra do mercado).
  const r = await pesquisarConcorrencia(item.modelo.titulo);
  const { mercado } = calcularMercado(r, detalhe.custo, pp);
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

/** Apaga uma pesquisa do histórico (e as repetidas do mesmo termo, que a tela mostra como uma só). */
export async function apagarPesquisa(pesquisaId: number) {
  const [p] = await db.select({ termo: pesquisasModelos.termo }).from(pesquisasModelos).where(eq(pesquisasModelos.id, pesquisaId));
  if (!p) return;
  await db.delete(pesquisasModelos).where(sql`lower(${pesquisasModelos.termo}) = lower(${p.termo})`);
}

/** Limpa todo o histórico de pesquisas (os produtos já cadastrados continuam). */
export async function limparPesquisas() {
  await db.delete(pesquisasModelos);
}
