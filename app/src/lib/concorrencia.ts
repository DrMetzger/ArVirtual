import "server-only";
import { afiliadosConfigurado, buscarOfertas, type Oferta } from "@/lib/afiliados";
import { get, tokenML } from "@/lib/pesquisa-mercado";

/**
 * Concorrência por produto: quem vende, em qual plataforma, por quanto e quanto vendeu.
 * - Shopee (API de afiliados): anúncios com loja, preço, vendas e avaliação.
 * - Mercado Livre: produtos do catálogo que batem com a busca e TODOS os vendedores de cada um
 *   (preço, preço "de", tipo de anúncio, frete, loja oficial), com apelido, cidade, reputação e vendas do vendedor.
 * - Magalu: não tem API de dados de concorrentes.
 */

export type Anuncio = {
  plataforma: "shopee" | "mercadolivre";
  vendedor: string;
  vendedorId: string;
  produto: string;
  imagem: string;
  link: string;
  preco: number;
  precoDe?: number;
  /** Shopee: vendas do anúncio. ML: vendas totais do vendedor (o ML não informa por anúncio). */
  vendas?: number;
  avaliacao?: number;
  reputacao?: string;
  medalha?: string;
  cidade?: string;
  freteGratis?: boolean;
  lojaOficial?: boolean;
  premium?: boolean;
};

export type Resumo = { anuncios: number; vendedores: number; min: number; mediana: number; max: number; vendas: number };

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export function resumir(lista: Anuncio[], somarVendas: boolean): Resumo {
  const precos = lista.map((a) => a.preco).filter((p) => p > 0);
  return {
    anuncios: lista.length,
    vendedores: new Set(lista.map((a) => a.vendedorId)).size,
    min: precos.length ? Math.min(...precos) : 0,
    mediana: mediana(precos),
    max: precos.length ? Math.max(...precos) : 0,
    vendas: somarVendas ? lista.reduce((s, a) => s + (a.vendas ?? 0), 0) : 0,
  };
}

async function shopee(q: string, erros: string[]): Promise<Anuncio[]> {
  if (!(await afiliadosConfigurado())) {
    erros.push("Shopee: cadastre a API de afiliados em Configurações para ver a concorrência da Shopee.");
    return [];
  }
  const ofertas: Oferta[] = [];
  for (let pagina = 1; pagina <= 2; pagina++) {
    const r = await buscarOfertas({ termo: q, pagina, limite: 50 }).catch((e: Error) => (erros.push(`Shopee: ${e.message}`), null));
    if (!r) break;
    ofertas.push(...r.ofertas);
    if (!r.temMais) break;
  }
  return ofertas.map((o) => ({
    plataforma: "shopee",
    vendedor: o.loja || `Loja ${o.shopId}`,
    vendedorId: o.shopId,
    produto: o.nome,
    imagem: o.imagem,
    link: o.linkProduto,
    preco: o.preco,
    precoDe: o.desconto ? Math.round((o.preco / (1 - o.desconto / 100)) * 100) / 100 : undefined,
    vendas: o.vendas,
    avaliacao: o.avaliacao,
    lojaOficial: o.tiposLoja.includes("Shopee Mall"),
  }));
}

type ItemML = {
  item_id: string;
  seller_id: number;
  price: number;
  original_price?: number | null;
  listing_type_id?: string;
  official_store_id?: number | null;
  shipping?: { free_shipping?: boolean };
};
type UsuarioML = { id: number; nickname?: string; address?: { city?: string; state?: string }; seller_reputation?: { level_id?: string | null; power_seller_status?: string | null; transactions?: { completed?: number; total?: number } } };

const REPUTACAO: Record<string, string> = { "5_green": "verde (ótima)", "4_light_green": "verde-clara", "3_yellow": "amarela", "2_orange": "laranja", "1_red": "vermelha" };
const MEDALHA: Record<string, string> = { platinum: "MercadoLíder Platinum", gold: "MercadoLíder Gold", silver: "MercadoLíder" };

async function mercadoLivre(q: string, erros: string[]): Promise<Anuncio[]> {
  const token = await tokenML().catch((e: Error) => (erros.push(`Mercado Livre: ${e.message}`), null));
  if (!token) return [];
  try {
    const busca = await get<{ results?: { id: string; name: string; pictures?: { url: string }[] }[] }>(
      `/products/search?site_id=MLB&status=active&q=${encodeURIComponent(q)}&limit=12`,
      token,
    );
    const produtos = busca?.results ?? [];
    const porProduto = await Promise.all(
      produtos.map(async (p) => ({ p, itens: (await get<{ results?: ItemML[] }>(`/products/${p.id}/items?limit=50`, token))?.results ?? [] })),
    );
    const ids = [...new Set(porProduto.flatMap((x) => x.itens.map((i) => i.seller_id)))];
    const usuarios = new Map<number, UsuarioML>();
    for (let i = 0; i < ids.length; i += 20) {
      const r = await get<{ code: number; body: UsuarioML }[]>(`/users?ids=${ids.slice(i, i + 20).join(",")}`, token);
      for (const u of r ?? []) if (u.code === 200) usuarios.set(u.body.id, u.body);
    }
    return porProduto.flatMap(({ p, itens }) =>
      itens.map((i) => {
        const u = usuarios.get(i.seller_id);
        return {
          plataforma: "mercadolivre" as const,
          vendedor: u?.nickname ?? `Vendedor ${i.seller_id}`,
          vendedorId: String(i.seller_id),
          produto: p.name,
          imagem: p.pictures?.[0]?.url?.replace(/^http:/, "https:") ?? "",
          link: `https://produto.mercadolivre.com.br/${i.item_id.replace(/^MLB/, "MLB-")}`,
          preco: i.price,
          precoDe: i.original_price && i.original_price > i.price ? i.original_price : undefined,
          vendas: u?.seller_reputation?.transactions?.completed,
          reputacao: REPUTACAO[u?.seller_reputation?.level_id ?? ""],
          medalha: MEDALHA[u?.seller_reputation?.power_seller_status ?? ""],
          cidade: u?.address?.city ? `${u.address.city}${u.address.state ? `/${u.address.state.replace("BR-", "")}` : ""}` : undefined,
          freteGratis: Boolean(i.shipping?.free_shipping),
          lojaOficial: Boolean(i.official_store_id),
          premium: i.listing_type_id === "gold_pro",
        };
      }),
    );
  } catch (e) {
    erros.push(`Mercado Livre: ${(e as Error).message}`);
    return [];
  }
}

export async function pesquisarConcorrencia(q: string) {
  const erros: string[] = [];
  const [s, m] = await Promise.all([shopee(q, erros), mercadoLivre(q, erros)]);
  return { shopee: s.sort((a, b) => (b.vendas ?? 0) - (a.vendas ?? 0)), mercadolivre: m.sort((a, b) => a.preco - b.preco), erros };
}
