import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosComissoes } from "@/db/schema";
import { getSettings } from "@/lib/settings";

// API de afiliados da Shopee (GraphQL). Credenciais em affiliate.shopee.com.br › Open API.
// Assinatura: SHA256(AppId + Timestamp + corpo JSON + Secret), no cabeçalho Authorization.
const URL_API = process.env.SHOPEE_AFILIADOS_URL || "https://open-api.affiliate.shopee.com.br/graphql";

export class AfiliadosErro extends Error {}

async function credenciais() {
  const s = await getSettings(["afiliados.appId", "afiliados.secret", "afiliados.subId"]);
  return { appId: s["afiliados.appId"], secret: s["afiliados.secret"], subId: s["afiliados.subId"] || "arvirtual" };
}

export async function afiliadosConfigurado() {
  const c = await credenciais();
  return Boolean(c.appId && c.secret);
}

async function chamar<T>(query: string): Promise<T> {
  const c = await credenciais();
  if (!c.appId || !c.secret) throw new AfiliadosErro("Cadastre o App ID e a Senha da API de afiliados em Configurações › Integrações › Shopee Afiliados.");
  const corpo = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = createHash("sha256").update(`${c.appId}${ts}${corpo}${c.secret}`).digest("hex");
  const res = await fetch(URL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${c.appId}, Timestamp=${ts}, Signature=${assinatura}` },
    body: corpo,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text();
  let r: { data?: T; errors?: { message?: string; extensions?: { message?: string; code?: number } }[] };
  try {
    r = JSON.parse(texto);
  } catch {
    throw new AfiliadosErro(`Shopee Afiliados (${res.status}): ${texto.slice(0, 200)}`);
  }
  if (r.errors?.length) {
    const e = r.errors[0]!;
    throw new AfiliadosErro(`Shopee Afiliados: ${e.extensions?.message || e.message || "erro"}${e.extensions?.code ? ` (${e.extensions.code})` : ""}`);
  }
  if (!r.data) throw new AfiliadosErro(`Shopee Afiliados (${res.status}): resposta sem dados.`);
  return r.data;
}

/** Texto para dentro da consulta GraphQL (aspas e barras escapadas). */
const str = (s: string) => JSON.stringify(s);

export type Oferta = {
  itemId: string;
  shopId: string;
  nome: string;
  imagem: string;
  loja: string;
  preco: number;
  precoMin: number;
  precoMax: number;
  comissaoTaxa: number;
  comissaoValor: number;
  vendas: number;
  avaliacao: number;
  linkProduto: string;
  linkOferta: string;
};

type NoOferta = {
  itemId: number;
  shopId: number;
  productName: string;
  imageUrl: string;
  shopName: string;
  priceMin: string;
  priceMax: string;
  commissionRate: string;
  commission: string;
  sales: number;
  ratingStar: string;
  productLink: string;
  offerLink: string;
};

const CAMPOS_OFERTA = "itemId shopId productName imageUrl shopName priceMin priceMax commissionRate commission sales ratingStar productLink offerLink";

function oferta(n: NoOferta): Oferta {
  const min = Number(n.priceMin) || 0;
  const max = Number(n.priceMax) || min;
  return {
    itemId: String(n.itemId),
    shopId: String(n.shopId),
    nome: n.productName,
    imagem: n.imageUrl,
    loja: n.shopName ?? "",
    preco: min,
    precoMin: min,
    precoMax: max,
    comissaoTaxa: Number(n.commissionRate) || 0,
    comissaoValor: Number(n.commission) || 0,
    vendas: Number(n.sales) || 0,
    avaliacao: Number(n.ratingStar) || 0,
    linkProduto: n.productLink,
    linkOferta: n.offerLink,
  };
}

export const ORDENS = {
  relevancia: 1,
  vendidos: 2,
  maiorPreco: 3,
  menorPreco: 4,
  comissao: 5,
} as const;

/** Busca produtos com oferta de comissão (por palavra-chave ou pelo item). */
export async function buscarOfertas(opcoes: { termo?: string; itemId?: string; shopId?: string; ordem?: keyof typeof ORDENS; pagina?: number }) {
  const args = [
    opcoes.termo ? `keyword: ${str(opcoes.termo)}` : "",
    opcoes.itemId ? `itemId: ${Number(opcoes.itemId)}` : "",
    opcoes.shopId ? `shopId: ${Number(opcoes.shopId)}` : "",
    `sortType: ${ORDENS[opcoes.ordem ?? "relevancia"]}`,
    `page: ${opcoes.pagina ?? 1}`,
    "limit: 20",
  ].filter(Boolean);
  const r = await chamar<{ productOfferV2: { nodes: NoOferta[]; pageInfo: { hasNextPage: boolean } } }>(
    `{ productOfferV2(${args.join(", ")}) { nodes { ${CAMPOS_OFERTA} } pageInfo { page limit hasNextPage } } }`,
  );
  return { ofertas: r.productOfferV2.nodes.map(oferta), temMais: r.productOfferV2.pageInfo.hasNextPage };
}

/** Link de afiliado curto (s.shopee.com.br/...) para a URL do produto, com os sub IDs (até 5) para rastrear a origem. */
export async function gerarLinkAfiliado(url: string, subIds: string[] = []) {
  const c = await credenciais();
  const ids = (subIds.length ? subIds : [c.subId]).map((s) => s.replace(/[^\w-]/g, "").slice(0, 50)).filter(Boolean).slice(0, 5);
  const r = await chamar<{ generateShortLink: { shortLink: string } }>(
    `mutation { generateShortLink(input: { originUrl: ${str(url)}, subIds: ${JSON.stringify(ids)} }) { shortLink } }`,
  );
  return r.generateShortLink.shortLink;
}

/** Shop ID e item ID de um link de produto da Shopee (segue o link curto, se for o caso). */
export async function idsDoLink(link: string): Promise<{ shopId: string; itemId: string } | null> {
  let url = link.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  const extrair = (u: string) => {
    const m = u.match(/\/product\/(\d+)\/(\d+)/) ?? u.match(/-i\.(\d+)\.(\d+)/) ?? u.match(/[?&]shopid=(\d+).*?[?&]itemid=(\d+)/i);
    return m ? { shopId: m[1]!, itemId: m[2]! } : null;
  };
  const direto = extrair(url);
  if (direto) return direto;
  // Link curto (s.shopee.com.br, shp.ee): segue os redirecionamentos até a página do produto.
  let atual = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(atual, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
    const prox = res?.headers.get("location");
    if (!prox) break;
    atual = new URL(prox, atual).toString();
    const ids = extrair(decodeURIComponent(atual));
    if (ids) return ids;
  }
  return null;
}

type NoConversao = {
  conversionId: number | string;
  purchaseTime: number;
  utmContent?: string;
  orders?: {
    orderId: string;
    orderStatus: string;
    shopName?: string;
    items?: { itemId: number | string; itemName: string; itemPrice: string; qty: number; itemTotalCommission?: string; actualAmount?: string }[];
  }[];
};

/**
 * Traz as comissões das compras feitas entre `desde` e `ate` (a Shopee guarda os últimos 3 meses)
 * e grava/atualiza um registro por item de pedido.
 */
export async function sincronizarComissoes(desde: Date, ate = new Date()) {
  let scroll = "";
  let total = 0;
  for (let pagina = 0; pagina < 200; pagina++) {
    const args = [
      `purchaseTimeStart: ${Math.floor(desde.getTime() / 1000)}`,
      `purchaseTimeEnd: ${Math.floor(ate.getTime() / 1000)}`,
      "limit: 500",
      scroll ? `scrollId: ${str(scroll)}` : "",
    ].filter(Boolean);
    const r = await chamar<{ conversionReport: { nodes: NoConversao[]; pageInfo: { hasNextPage: boolean; scrollId: string } } }>(
      `{ conversionReport(${args.join(", ")}) { nodes { conversionId purchaseTime utmContent orders { orderId orderStatus shopName items { itemId itemName itemPrice qty itemTotalCommission actualAmount } } } pageInfo { hasNextPage scrollId } } }`,
    );
    for (const n of r.conversionReport.nodes) {
      for (const o of n.orders ?? []) {
        for (const it of o.items ?? []) {
          const valores = {
            itemNome: it.itemName ?? "",
            loja: o.shopName ?? "",
            quantidade: Number(it.qty) || 1,
            valor: Number(it.actualAmount ?? it.itemPrice) || 0,
            comissao: Number(it.itemTotalCommission) || 0,
            status: o.orderStatus ?? "",
            subId: n.utmContent ?? "",
            compraEm: new Date(Number(n.purchaseTime) * 1000),
            dados: { conversao: { ...n, orders: undefined }, pedido: { ...o, items: undefined }, item: it },
            atualizadoEm: new Date(),
          };
          await db
            .insert(afiliadosComissoes)
            .values({ conversionId: String(n.conversionId), orderId: o.orderId, itemId: String(it.itemId), ...valores })
            .onConflictDoUpdate({
              target: [afiliadosComissoes.conversionId, afiliadosComissoes.orderId, afiliadosComissoes.itemId],
              set: valores,
            });
          total++;
        }
      }
    }
    if (!r.conversionReport.pageInfo.hasNextPage || !r.conversionReport.pageInfo.scrollId) break;
    scroll = r.conversionReport.pageInfo.scrollId;
  }
  return total;
}

/** Status do pedido de afiliado em português. */
export const STATUS_COMISSAO: Record<string, { rotulo: string; tom: "green" | "gold" | "red" | "neutral" | "blue" }> = {
  COMPLETED: { rotulo: "Concluída", tom: "green" },
  PENDING: { rotulo: "Pendente", tom: "gold" },
  UNPAID: { rotulo: "Aguardando pagamento", tom: "neutral" },
  CANCELLED: { rotulo: "Cancelada", tom: "red" },
};

export const somaComissoes = sql<number>`coalesce(sum(${afiliadosComissoes.comissao}), 0)::float`;
