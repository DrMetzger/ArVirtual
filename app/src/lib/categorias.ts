import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categorias, produtos } from "@/db/schema";
import { gerarComGemini } from "@/lib/gemini";

export type Categoria = { id: number; nome: string };

/** Categorias na ordem do cadastro. */
export async function listaCategorias(): Promise<Categoria[]> {
  return db.select({ id: categorias.id, nome: categorias.nome }).from(categorias).orderBy(asc(categorias.ordem), asc(categorias.nome));
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Pede à IA a categoria de cada produto (só entre as cadastradas). Devolve id do produto → id da categoria. */
export async function classificarProdutos(itens: { id: string; nome: string; descricao?: string }[], cats?: Categoria[]): Promise<Map<string, number>> {
  const lista = cats ?? (await listaCategorias());
  const out = new Map<string, number>();
  if (!lista.length || !itens.length) return out;
  const porNome = new Map(lista.map((c) => [sem(c.nome), c.id]));
  for (let i = 0; i < itens.length; i += 40) {
    const lote = itens.slice(i, i + 40);
    const texto = await gerarComGemini(
      [
        {
          role: "user",
          text:
            `Categorias da loja (peças impressas em 3D):\n${lista.map((c) => `- ${c.nome}`).join("\n")}\n\n` +
            `Classifique cada produto em UMA dessas categorias (escreva o nome exatamente como está na lista).\n` +
            `Produtos:\n${lote.map((p, k) => `${k + 1}. ${p.nome}${p.descricao ? ` — ${p.descricao.replace(/\s+/g, " ").slice(0, 160)}` : ""}`).join("\n")}\n\n` +
            `Responda só JSON: [{"n": número do produto, "categoria": "nome"}]`,
        },
      ],
      { json: true, temperature: 0.1 },
    );
    let resp: { n?: number; categoria?: string }[] = [];
    try {
      const j = JSON.parse(texto);
      resp = Array.isArray(j) ? j : Array.isArray(j?.produtos) ? j.produtos : [];
    } catch {
      continue;
    }
    for (const r of resp) {
      const p = lote[Number(r.n) - 1];
      const id = porNome.get(sem(String(r.categoria ?? "")));
      if (p && id) out.set(p.id, id);
    }
  }
  return out;
}

/** Categoriza com IA os produtos principais que ainda estão sem categoria. */
export async function categorizarSemCategoria(): Promise<{ categorizados: number; restantes: number }> {
  const pend = await db
    .select({ id: produtos.id, nome: produtos.nome, descricao: produtos.descricao })
    .from(produtos)
    .where(and(isNull(produtos.paiId), isNull(produtos.categoriaId)))
    .limit(400);
  const mapa = await classificarProdutos(pend);
  const porCat = new Map<number, string[]>();
  for (const [p, c] of mapa) porCat.set(c, [...(porCat.get(c) ?? []), p]);
  for (const [c, ids] of porCat) {
    await db.update(produtos).set({ categoriaId: c }).where(inArray(produtos.id, ids));
    // As variações acompanham o produto principal.
    await db.update(produtos).set({ categoriaId: c }).where(inArray(produtos.paiId, ids));
  }
  return { categorizados: mapa.size, restantes: pend.length - mapa.size };
}

/** Categoria de um produto novo (importado): IA; se falhar, fica sem. */
export async function categoriaDoProduto(produtoId: string, nome: string, descricao = "") {
  try {
    const m = await classificarProdutos([{ id: produtoId, nome, descricao }]);
    const c = m.get(produtoId);
    if (c) await db.update(produtos).set({ categoriaId: c }).where(eq(produtos.id, produtoId));
  } catch {
    /* sem categoria: aparece em "Sem categoria" */
  }
}
