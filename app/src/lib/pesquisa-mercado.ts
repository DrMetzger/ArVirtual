import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace } from "@/db/schema";
import { contaComToken } from "@/lib/marketplaces";

/**
 * Pesquisa de mercado no Mercado Livre: categorias do termo, buscas em alta, ranking de mais vendidos
 * e produtos do catálogo. Só dados públicos de mercado (o ML não informa quanto cada vendedor vendeu,
 * nem libera anúncios de outros vendedores para apps: o ranking é a medida de venda).
 */
const API = process.env.ML_API_URL ?? "https://api.mercadolibre.com";

export type CategoriaPesquisa = { id: string; nome: string; caminho: string };
export type ProdutoMercado = {
  id: string;
  posicao?: number;
  nome: string;
  imagem: string;
  link: string;
  preco?: number;
  precoOriginal?: number;
  vendedores?: number;
  freteGratis?: boolean;
  lojaOficial?: boolean;
};
export type ResultadoPesquisa = {
  categorias: CategoriaPesquisa[];
  categoria?: CategoriaPesquisa;
  emAlta: string[];
  maisVendidos: ProdutoMercado[];
  ocultos: number;
  catalogo: ProdutoMercado[];
};

// Cache curto: o ranking do ML muda ao longo do dia, e a mesma pesquisa repetida não gasta a cota da API.
const cache = new Map<string, { ate: number; valor: unknown }>();
async function emCache<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(chave);
  if (c && c.ate > Date.now()) return c.valor as T;
  const valor = await fn();
  cache.set(chave, { ate: Date.now() + 60 * 60_000, valor });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return valor;
}

export async function tokenML() {
  const [conta] = await db.select().from(contasMarketplace).where(eq(contasMarketplace.marketplace, "mercadolivre")).orderBy(asc(contasMarketplace.id)).limit(1);
  if (!conta) throw new Error("Conecte uma conta do Mercado Livre em Marketplaces para usar a pesquisa.");
  return (await contaComToken(conta)).accessToken;
}

/** GET na API do ML; devolve null quando o recurso não existe ou não é liberado para o app. */
export async function get<T>(caminho: string, token: string): Promise<T | null> {
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 401) throw new Error("O token do Mercado Livre expirou: reconecte a conta em Marketplaces.");
  if (r.status === 429) throw new Error("O Mercado Livre limitou as consultas agora. Tente de novo em alguns minutos.");
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

type ProdutoML = { id: string; name: string; permalink?: string; pictures?: { url: string }[] };
type ItensML = {
  paging?: { total: number };
  results?: { price: number; original_price?: number | null; official_store_id?: number | null; shipping?: { free_shipping?: boolean } }[];
};

/** Produto do catálogo com o menor preço entre os vendedores que disputam a vitrine dele. */
export async function produto(id: string, token: string, posicao?: number): Promise<ProdutoMercado | null> {
  return emCache(`p:${id}`, async () => {
    const [p, itens] = await Promise.all([get<ProdutoML>(`/products/${id}`, token), get<ItensML>(`/products/${id}/items?limit=20`, token)]);
    if (!p?.name) return null;
    const ofertas = itens?.results ?? [];
    const menor = ofertas.reduce<(typeof ofertas)[number] | undefined>((m, o) => (!m || o.price < m.price ? o : m), undefined);
    return {
      id,
      nome: p.name,
      imagem: p.pictures?.[0]?.url?.replace(/^http:/, "https:") ?? "",
      link: p.permalink || `https://www.mercadolivre.com.br/p/${id}`,
      preco: menor?.price,
      precoOriginal: menor?.original_price && menor.original_price > menor.price ? menor.original_price : undefined,
      vendedores: itens?.paging?.total ?? ofertas.length,
      freteGratis: ofertas.some((o) => o.shipping?.free_shipping),
      lojaOficial: ofertas.some((o) => o.official_store_id),
    };
  }).then((r) => (r ? { ...r, posicao } : null));
}

export async function pesquisarMercado(termo: string, categoriaId?: string): Promise<ResultadoPesquisa> {
  const token = await tokenML();
  const q = encodeURIComponent(termo);

  const sugestoes =
    (await emCache(`d:${termo}`, () => get<{ category_id: string; category_name: string }[]>(`/sites/MLB/domain_discovery/search?q=${q}&limit=6`, token))) ?? [];
  const ids = [...new Set(sugestoes.map((s) => s.category_id))];
  if (categoriaId && /^MLB\d+$/.test(categoriaId) && !ids.includes(categoriaId)) ids.unshift(categoriaId);
  const categorias = (
    await Promise.all(
      ids.slice(0, 6).map((id) =>
        emCache(`c:${id}`, async () => {
          const c = await get<{ name: string; path_from_root?: { name: string }[] }>(`/categories/${id}`, token);
          return c ? { id, nome: c.name, caminho: (c.path_from_root ?? []).map((x) => x.name).join(" › ") } : null;
        }),
      ),
    )
  ).filter((c): c is CategoriaPesquisa => Boolean(c));
  const categoria = categorias.find((c) => c.id === categoriaId) ?? categorias[0];

  const [emAlta, ranking, busca] = await Promise.all([
    categoria ? emCache(`t:${categoria.id}`, () => get<{ keyword: string }[]>(`/trends/MLB/${categoria.id}`, token)) : null,
    categoria ? emCache(`h:${categoria.id}`, () => get<{ content?: { id: string; position: number; type: string }[] }>(`/highlights/MLB/category/${categoria.id}`, token)) : null,
    emCache(`s:${termo}`, () => get<{ results?: { id: string }[] }>(`/products/search?site_id=MLB&status=active&q=${q}&limit=12`, token)),
  ]);

  // O ranking mistura produtos de catálogo (dados liberados) com anúncios avulsos de outros vendedores (não liberados).
  const conteudo = (ranking?.content ?? []).slice(0, 20);
  const doCatalogo = conteudo.filter((c) => c.type === "PRODUCT");
  const maisVendidos = (await Promise.all(doCatalogo.map((c) => produto(c.id, token, c.position)))).filter((p): p is ProdutoMercado => Boolean(p));
  const noRanking = new Set(maisVendidos.map((p) => p.id));
  const catalogo = (await Promise.all((busca?.results ?? []).filter((r) => !noRanking.has(r.id)).map((r) => produto(r.id, token)))).filter(
    (p): p is ProdutoMercado => Boolean(p),
  );

  return {
    categorias,
    categoria,
    emAlta: (emAlta ?? []).map((t) => t.keyword).slice(0, 20),
    maisVendidos,
    ocultos: conteudo.length - maisVendidos.length,
    catalogo,
  };
}
