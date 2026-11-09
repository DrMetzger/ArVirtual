import "server-only";
import { afiliadosConfigurado, buscarOfertas, type Oferta } from "@/lib/afiliados";
import { gerarComGemini, gerarComGeminiDetalhado, geminiConfigurado } from "@/lib/gemini";
import { get, tokenML } from "@/lib/pesquisa-mercado";

/**
 * Concorrência por produto: quem vende, em qual plataforma, por quanto e quanto vendeu.
 * - Shopee (API de afiliados): anúncios com loja, preço, vendas e avaliação.
 * - Mercado Livre: produtos do catálogo que batem com a busca e TODOS os vendedores de cada um
 *   (preço, preço "de", tipo de anúncio, frete, loja oficial), com apelido, cidade, reputação e vendas do vendedor.
 * - Magalu: não tem API de dados de concorrentes.
 */

export type Anuncio = {
  plataforma: "shopee" | "mercadolivre" | "magalu";
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
      produtos.map(async (p) => {
        const [itens, detalhe] = await Promise.all([
          get<{ results?: ItemML[] }>(`/products/${p.id}/items?limit=50`, token),
          // A busca às vezes vem sem foto: o produto do catálogo tem.
          p.pictures?.length ? null : get<{ pictures?: { url: string }[] }>(`/products/${p.id}`, token),
        ]);
        return { p: { ...p, pictures: p.pictures?.length ? p.pictures : (detalhe?.pictures ?? []) }, itens: itens?.results ?? [] };
      }),
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

/**
 * Magalu não tem API de concorrência e bloqueia leitura automática do site; a IA pesquisa no Google
 * só dentro do magazineluiza.com.br e lista o que achou. Só entram links do próprio Magalu.
 */
async function magalu(q: string, erros: string[]): Promise<Anuncio[]> {
  if (!(await geminiConfigurado())) {
    erros.push("Magalu: cadastre a chave do Gemini em Configurações para a IA pesquisar no Magalu.");
    return [];
  }
  const prompt = `Pesquise no Google (site:magazineluiza.com.br) anúncios à venda AGORA no Magalu para: "${q}".
Liste até 15 anúncios reais que você encontrou nas páginas do magazineluiza.com.br: nome do produto, quem vende
(o "Vendido e entregue por ..." da página; "Magalu" se for a própria loja), preço à vista em reais, o link da página do produto
e, se viu, o endereço da foto do produto (as fotos do Magalu ficam em a-static.mlcdn.com.br; se não viu, "").
Não invente nada: se não achar, devolva a lista vazia. Responda SOMENTE com um bloco JSON:
{"anuncios":[{"produto":"...","vendedor":"...","preco":0,"link":"https://www.magazineluiza.com.br/...","imagem":"https://a-static.mlcdn.com.br/..."}]}`;
  try {
    const r = await Promise.race([
      gerarComGeminiDetalhado([{ role: "user", text: prompt }], { pesquisa: true, temperature: 0.1 }),
      new Promise<never>((_, nao) => setTimeout(() => nao(new Error("a pesquisa demorou demais")), 55_000)),
    ]);
    const json = r.texto.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    const lista = (JSON.parse(json) as { anuncios?: { produto?: string; vendedor?: string; preco?: number | string; link?: string; imagem?: string }[] }).anuncios ?? [];
    return lista
      .filter((a) => a.produto && /^https:\/\/(www\.)?magazineluiza\.com\.br\//.test(a.link ?? ""))
      .map((a) => ({
        plataforma: "magalu" as const,
        vendedor: (a.vendedor || "não informado").slice(0, 80),
        vendedorId: (a.vendedor || "?").toLowerCase(),
        produto: String(a.produto).slice(0, 200),
        // Só foto da CDN do próprio Magalu.
        imagem: /^https:\/\/a-static\.mlcdn\.com\.br\//.test(a.imagem ?? "") ? a.imagem! : "",
        link: a.link!,
        preco: Number(String(a.preco ?? 0).replace(/[^\d,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || 0,
      }));
  } catch (e) {
    erros.push(`Magalu (pesquisa da IA): ${(e as Error).message}`);
    return [];
  }
}

// Mesma pesquisa repetida em 10 minutos (voltar à página, trocar de tela) não consulta tudo de novo.
const cache = new Map<string, { ate: number; r: Awaited<ReturnType<typeof pesquisarAgora>> }>();
export async function pesquisarConcorrencia(q: string) {
  const k = q.toLowerCase();
  const c = cache.get(k);
  if (c && c.ate > Date.now()) return c.r;
  const r = await pesquisarAgora(q);
  // Resultado com falha não fica guardado.
  if (!r.erros.length) cache.set(k, { ate: Date.now() + 10 * 60_000, r });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return r;
}

const VAZIAS = new Set(["para", "com", "sem", "de", "do", "da", "dos", "das", "em", "no", "na", "e", "o", "a", "os", "as", "um", "uma", "kit", "novo", "nova", "cor", "cores", "pecas", "peca", "un", "und", "unid", "pcs"]);
const palavras = (t: string) =>
  [...new Set(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/))].filter((w) => w.length > 1 && !VAZIAS.has(w));

/**
 * Só concorrente de verdade: 1) o título tem as palavras importantes da pesquisa (metade delas, no mínimo);
 * 2) a IA confirma que é o mesmo tipo de produto (ex.: "suporte de controle de PS5", não "capa de controle").
 */
async function filtrarParecidos(q: string, todos: Anuncio[], erros: string[]) {
  const chave = palavras(q);
  const minimo = Math.max(1, Math.ceil(chave.length / 2));
  const porPalavra = todos.filter((a) => {
    const t = new Set(palavras(a.produto));
    return chave.filter((w) => t.has(w) || [...t].some((x) => x.startsWith(w) || w.startsWith(x))).length >= minimo;
  });
  if (!porPalavra.length || !(await geminiConfigurado())) return new Set(porPalavra);
  const titulos = [...new Set(porPalavra.map((a) => a.produto))].slice(0, 250);
  try {
    const r = JSON.parse(
      await gerarComGemini(
        [
          {
            role: "user",
            text: `Estou pesquisando concorrentes para o produto: "${q}".
Abaixo, títulos de anúncios (número | título). Marque SÓ os que são o MESMO TIPO de produto, concorrente direto que o comprador
compararia (mesma função e mesmo uso; variações de cor, tamanho, modelo e kit contam). Exclua acessórios diferentes, peças de
outra categoria e produtos que só compartilham palavras. Responda SOMENTE JSON: {"parecidos":[números]}

${titulos.map((t, i) => `${i + 1} | ${t}`).join("\n")}`,
          },
        ],
        { json: true, temperature: 0 },
      ),
    ) as { parecidos?: number[] };
    const ok = new Set((r.parecidos ?? []).map((n) => titulos[Number(n) - 1]).filter(Boolean));
    // Títulos além do limite enviado à IA ficam pelo filtro de palavras.
    return new Set(porPalavra.filter((a) => ok.has(a.produto) || !titulos.includes(a.produto)));
  } catch (e) {
    erros.push(`Filtro da IA indisponível agora (${(e as Error).message}); filtrei só pelas palavras.`);
    return new Set(porPalavra);
  }
}

async function pesquisarAgora(q: string) {
  const erros: string[] = [];
  const [s, m, g] = await Promise.all([shopee(q, erros), mercadoLivre(q, erros), magalu(q, erros)]);
  const parecidos = await filtrarParecidos(q, [...s, ...m, ...g], erros);
  const separar = (lista: Anuncio[]) => ({ sim: lista.filter((a) => parecidos.has(a)), nao: lista.filter((a) => !parecidos.has(a)) });
  const [ps, pm, pg] = [separar(s), separar(m), separar(g)];
  return {
    shopee: ps.sim.sort((a, b) => (b.vendas ?? 0) - (a.vendas ?? 0)),
    mercadolivre: pm.sim.sort((a, b) => a.preco - b.preco),
    magalu: pg.sim.sort((a, b) => a.preco - b.preco),
    descartados: [...ps.nao, ...pm.nao, ...pg.nao],
    erros,
  };
}
