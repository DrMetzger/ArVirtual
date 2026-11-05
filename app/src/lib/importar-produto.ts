import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { anuncios, contasMarketplace, ncms, produtos, type Marketplace } from "@/db/schema";
import { buscarOfertas, idsDoLink } from "@/lib/afiliados";
import { gerarComGemini } from "@/lib/gemini";
import { adapter, contaComToken } from "@/lib/marketplaces";
import type { DadosImportados } from "@/lib/marketplaces/types";
import { cadastroPelaIA } from "@/lib/produto-ia";
import { MAX_VIDEO, UPLOAD_DIR } from "@/lib/uploads";

/** Passo do importador para a barra de progresso da tela. */
export type Passo = { etapa: string; pct: number; detalhe?: string };

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_FOTOS = 10;

function marketplaceDoLink(link: string): Marketplace | null {
  const h = link.toLowerCase();
  if (/mercadoli[vb]re|mlb-?\d|\/p\/mlb/.test(h)) return "mercadolivre";
  if (/shopee|shp\.ee/.test(h)) return "shopee";
  if (/magazineluiza|magalu/.test(h)) return "magalu";
  return null;
}

/** Página de qualquer loja: dados publicados para o Google (JSON-LD Product) e as metatags og:. */
async function lerPaginaLoja(link: string): Promise<DadosImportados | null> {
  const res = await fetch(link, { headers: { "User-Agent": NAVEGADOR, "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text();
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]+)"`, "i"))?.[1];
  type Ld = { "@type"?: string | string[]; name?: string; description?: string; image?: string | string[] | { url?: string }[]; gtin13?: string; gtin?: string; sku?: string; offers?: { price?: string | number } | { price?: string | number }[] };
  let produto: Ld | undefined;
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(m[1]!) as Ld | Ld[] | { "@graph"?: Ld[] };
      const lista = Array.isArray(d) ? d : "@graph" in d && d["@graph"] ? d["@graph"] : [d as Ld];
      produto = lista.find((x) => [x["@type"]].flat().includes("Product")) ?? produto;
    } catch {
      // JSON-LD quebrado: ignora
    }
  }
  const fotos = produto?.image ? [produto.image].flat().map((i) => (typeof i === "string" ? i : (i.url ?? ""))) : [meta("og:image")].filter(Boolean);
  const titulo = produto?.name ?? meta("og:title");
  if (!titulo) return null;
  const oferta = [produto?.offers].flat()[0];
  const videoOg = meta("og:video") ?? meta("og:video:url");
  return {
    titulo,
    descricao: produto?.description ?? meta("og:description") ?? meta("description") ?? "",
    fotos: fotos.filter((f): f is string => Boolean(f)).map((f) => new URL(f, link).toString()),
    videos: videoOg && /\.mp4/i.test(videoOg) ? [new URL(videoOg, link).toString()] : [],
    preco: oferta?.price ? Number(String(oferta.price).replace(",", ".")) || undefined : undefined,
    gtin: produto?.gtin13 ?? produto?.gtin,
    link,
  };
}

/** Lê o anúncio: primeiro pelas contas conectadas (dados completos), depois API de afiliados (Shopee) e a página da loja. */
async function lerAnuncio(link: string): Promise<{ dados: DadosImportados; conta?: { id: number; marketplace: Marketplace } }> {
  const mp = marketplaceDoLink(link);
  if (mp) {
    const contas = await db.select().from(contasMarketplace).where(eq(contasMarketplace.marketplace, mp));
    // Link curto da Shopee (s.shopee.com.br): resolve para o endereço com shop_id/item_id.
    let alvo = link;
    if (mp === "shopee" && !/\/product\/\d+\/\d+|-i\.\d+\.\d+/.test(link)) {
      const ids = await idsDoLink(link).catch(() => null);
      if (ids) alvo = `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`;
    }
    for (const c of contas) {
      const a = adapter(c.marketplace);
      const d = await a.importar?.(await contaComToken(c), alvo).catch(() => null);
      if (d) return { dados: d, conta: { id: c.id, marketplace: c.marketplace } };
    }
    // Produto de outra loja na Shopee: nome, foto e preço pela API de afiliados.
    if (mp === "shopee") {
      const ids = await idsDoLink(alvo).catch(() => null);
      const o = ids ? (await buscarOfertas({ itemId: ids.itemId, shopId: ids.shopId }).catch(() => null))?.ofertas.find((x) => x.itemId === ids.itemId) : undefined;
      if (o) return { dados: { titulo: o.nome, descricao: "", fotos: o.imagem ? [o.imagem] : [], videos: [], preco: o.preco, link: o.linkProduto } };
    }
    if (mp === "mercadolivre")
      throw new Error(
        "Não achei este anúncio nas suas contas do Mercado Livre conectadas. Confira se a conta dona do anúncio está conectada em Marketplaces › Mercado Livre (o ML bloqueia a leitura da página do anúncio por servidores).",
      );
  }
  const d = await lerPaginaLoja(link);
  if (d) return { dados: d };
  throw new Error("Não consegui ler esse link: a loja bloqueia leitura automática ou não publica os dados do produto. Use o link do seu anúncio no ML, Shopee ou Magalu.");
}

/** Baixa a foto e grava em JPEG (até 1600 px, sem perder a proporção). Devolve a URL pública ou null. */
async function converterFoto(url: string, origin: string) {
  const res = await fetch(url, { headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const jpg = await sharp(buf).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer().catch(() => null);
  if (!jpg) return null;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nome = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.jpg`;
  await writeFile(`${UPLOAD_DIR}/${nome}`, jpg);
  return { url: `${process.env.APP_URL ?? origin}/uploads/${nome}`, jpg };
}

/** Baixa o vídeo MP4 (até 30 MB, limite da Shopee). */
async function converterVideo(url: string, origin: string) {
  const res = await fetch(url, { headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(5 * 60_000) }).catch(() => null);
  if (!res?.ok || Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_VIDEO || buf.length < 1000) return null;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nome = `video-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.mp4`;
  await writeFile(`${UPLOAD_DIR}/${nome}`, buf);
  return (await stat(`${UPLOAD_DIR}/${nome}`).catch(() => null)) ? `${process.env.APP_URL ?? origin}/uploads/${nome}` : null;
}

/** NCM: o do anúncio (Magalu informa) se estiver cadastrado; senão a IA escolhe na lista dos NCMs cadastrados. */
async function escolherNcm(dados: DadosImportados, titulo: string) {
  const lista = await db.select({ codigo: ncms.codigo, descricao: ncms.descricao, pendente: ncms.pendente }).from(ncms);
  if (dados.ncm && lista.some((n) => n.codigo === dados.ncm)) return dados.ncm;
  if (!lista.length) return dados.ncm ?? "";
  const opcoes = lista.map((n) => `${n.codigo}${n.pendente ? "" : ` - ${n.descricao}`}`).join("\n");
  const prompt = `Escolha o NCM mais adequado para o produto, SOMENTE entre os NCMs da lista (o produto é fabricado por impressão 3D em plástico).
Produto: ${titulo}
Descrição: ${dados.descricao.slice(0, 600)}

NCMs cadastrados:
${opcoes}

Responda só com JSON: {"ncm": "8 dígitos da lista"}`;
  const r = JSON.parse(await gerarComGemini([{ role: "user", text: prompt }], { json: true, temperature: 0 }).catch(() => "{}")) as { ncm?: string };
  const ncm = String(r.ncm ?? "").replace(/\D/g, "");
  return lista.some((n) => n.codigo === ncm) ? ncm : (dados.ncm ?? lista[0]!.codigo);
}

/**
 * Cria o produto a partir do link, avisando cada etapa (barra de progresso): lê o anúncio, converte as fotos e o
 * vídeo, a IA escreve título e descrição (no estilo do ERP) e escolhe o NCM, e salva. Anúncio da própria conta já
 * fica vinculado ao produto.
 */
export async function* importarProduto(link: string, origin: string): AsyncGenerator<Passo, { id: string; nome: string; avisos: string[] }> {
  const avisos: string[] = [];
  yield { etapa: "Lendo o anúncio", pct: 5, detalhe: link };
  const { dados, conta } = await lerAnuncio(link);
  yield { etapa: "Lendo o anúncio", pct: 15, detalhe: dados.titulo };

  const fotosOrigem = [...new Set(dados.fotos)].slice(0, MAX_FOTOS);
  const fotos: string[] = [];
  let capa: Buffer | null = null;
  for (const [i, f] of fotosOrigem.entries()) {
    yield { etapa: "Convertendo fotos", pct: 15 + Math.round(((i + 1) / Math.max(fotosOrigem.length, 1)) * 35), detalhe: `${i + 1} de ${fotosOrigem.length}` };
    const u = await converterFoto(f, origin);
    if (u) {
      fotos.push(u.url);
      capa ??= u.jpg;
    }
  }
  if (!fotosOrigem.length) avisos.push("O anúncio não tinha fotos.");
  else if (fotos.length < fotosOrigem.length) avisos.push(`${fotosOrigem.length - fotos.length} foto(s) não puderam ser baixadas.`);

  const videos: string[] = [];
  if (dados.videos.length) {
    for (const [i, v] of dados.videos.slice(0, 3).entries()) {
      yield { etapa: "Convertendo vídeo", pct: 52 + i * 5, detalhe: `${i + 1} de ${Math.min(dados.videos.length, 3)}` };
      const u = await converterVideo(v, origin);
      if (u) videos.push(u);
      else avisos.push("Um vídeo passou de 30 MB (limite da Shopee) ou não pôde ser baixado.");
    }
  } else {
    yield { etapa: "Convertendo vídeo", pct: 60, detalhe: "o anúncio não tem vídeo" };
  }

  yield { etapa: "Criando título e descrição", pct: 65, detalhe: "IA escrevendo no estilo dos seus anúncios" };
  let titulo = dados.titulo.slice(0, 60);
  let descricao = dados.descricao;
  try {
    // A IA olha a 1ª foto e o texto original e reescreve curto e vendedor (como o "Gerar com IA" do cadastro).
    const ia = await cadastroPelaIA({
      texto: `${dados.titulo}\n\n${dados.descricao}`.slice(0, 2000),
      fotos: capa ? [{ mimeType: "image/jpeg", data: (await sharp(capa).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()).toString("base64") }] : [],
      material: "",
      cor: "",
      pesoG: dados.pesoG ?? 0,
      medidas: { altura: dados.alturaCm ?? 0, largura: dados.larguraCm ?? 0, profundidade: dados.comprimentoCm ?? 0 },
      quantidade: 1,
    });
    if (ia.titulo) titulo = ia.titulo;
    if (ia.descricao) descricao = ia.descricao;
  } catch (e) {
    avisos.push(`A IA não respondeu (${(e as Error).message.slice(0, 80)}): ficaram o título e a descrição originais.`);
  }

  yield { etapa: "Escolhendo o NCM", pct: 85 };
  const ncm = await escolherNcm(dados, titulo).catch(() => dados.ncm ?? "");

  yield { etapa: "Salvando o produto", pct: 95 };
  // SKU do anúncio se ainda não existe no cadastro; senão um novo.
  const existe = async (s: string) => Boolean(s && (await db.select({ id: produtos.id }).from(produtos).where(sql`lower(${produtos.sku}) = lower(${s})`).limit(1)).length);
  const sku = dados.sku && !(await existe(dados.sku)) ? dados.sku.slice(0, 60) : `IMP-${Date.now().toString(36).toUpperCase()}`;
  const [p] = await db
    .insert(produtos)
    .values({
      sku,
      nome: titulo,
      descricao,
      ncm,
      gtin: dados.gtin ?? "",
      preco: dados.preco ?? 0,
      pesoG: Math.round(dados.pesoG ?? 0),
      alturaCm: dados.alturaCm ?? 0,
      larguraCm: dados.larguraCm ?? 0,
      comprimentoCm: dados.comprimentoCm ?? 0,
      imagens: fotos,
      videos,
    })
    .returning({ id: produtos.id, nome: produtos.nome });
  if (conta && dados.idExterno) {
    await db.insert(anuncios).values({
      produtoId: p!.id,
      contaId: conta.id,
      marketplace: conta.marketplace,
      idExterno: dados.idExterno,
      link: dados.link ?? link,
      status: "publicado",
      preco: dados.preco ?? 0,
      mensagem: "Criado pelo importador (anúncio de origem)",
    });
  }
  if (!ncm) avisos.push("Escolha o NCM do produto (nenhum NCM cadastrado combinou).");
  avisos.push("Confira custo, filamento e estoque antes de anunciar.");
  yield { etapa: "Pronto", pct: 100, detalhe: titulo };
  return { id: p!.id, nome: p!.nome, avisos };
}
