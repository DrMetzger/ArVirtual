import "server-only";
import { createHmac } from "node:crypto";
import { getSettings } from "@/lib/settings";
import { lerResposta, MarketplaceError, type ContaComToken, type MarketplaceAdapter, type Tokens } from "./types";

// Shopee Open Platform v2: https://open.shopee.com/documents
// Toda chamada é assinada com HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]).

async function credenciais() {
  const s = await getSettings(["shopee.partnerId", "shopee.partnerKey", "shopee.ambiente"]);
  const host =
    s["shopee.ambiente"] === "sandbox" ? "https://partner.test-stable.shopeemobile.com" : "https://partner.shopeemobile.com";
  return { partnerId: s["shopee.partnerId"], partnerKey: s["shopee.partnerKey"], host };
}

function assinar(partnerKey: string, ...parts: (string | number)[]) {
  return createHmac("sha256", partnerKey).update(parts.join("")).digest("hex");
}

type ShopeeBase = { error?: string; message?: string };

function checar<T extends ShopeeBase>(r: T, origem: string): T {
  if (r.error) throw new MarketplaceError(`Shopee ${origem}: ${r.message || r.error}`);
  return r;
}

async function publicCall<T extends ShopeeBase>(path: string, body: unknown) {
  const c = await credenciais();
  const ts = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({ partner_id: c.partnerId, timestamp: String(ts), sign: assinar(c.partnerKey, c.partnerId, path, ts) });
  const res = await fetch(`${c.host}${path}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return checar(await lerResposta<T>(res, "Shopee"), path);
}

async function shopCall<T extends ShopeeBase>(
  conta: ContaComToken,
  path: string,
  opts: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; form?: FormData } = {},
) {
  const c = await credenciais();
  const ts = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({
    partner_id: c.partnerId,
    timestamp: String(ts),
    access_token: conta.accessToken,
    shop_id: conta.idExterno,
    sign: assinar(c.partnerKey, c.partnerId, path, ts, conta.accessToken, conta.idExterno),
    ...opts.query,
  });
  const res = await fetch(`${c.host}${path}?${q}`, {
    method: opts.method ?? "GET",
    headers: opts.form ? undefined : { "Content-Type": "application/json" },
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    signal: AbortSignal.timeout(30_000),
  });
  return checar(await lerResposta<T>(res, "Shopee"), path);
}

type TokenResp = ShopeeBase & { access_token: string; refresh_token: string; expire_in: number };
const toTokens = (t: TokenResp): Tokens => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiraEm: new Date(Date.now() + t.expire_in * 1000),
});

async function enviarImagem(conta: ContaComToken, url: string) {
  const img = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!img.ok) throw new MarketplaceError(`Não foi possível baixar a imagem ${url}`);
  const form = new FormData();
  form.append("image", new Blob([await img.arrayBuffer()]), "imagem.jpg");
  const r = await shopCall<ShopeeBase & { response: { image_info: { image_id: string } } }>(
    conta,
    "/api/v2/media_space/upload_image",
    { method: "POST", form },
  );
  return r.response.image_info.image_id;
}

export const shopee: MarketplaceAdapter = {
  id: "shopee",
  nome: "Shopee",

  async configurado() {
    const c = await credenciais();
    return Boolean(c.partnerId && c.partnerKey);
  },

  async urlAutorizacao(redirectUri, state) {
    const c = await credenciais();
    const path = "/api/v2/shop/auth_partner";
    const ts = Math.floor(Date.now() / 1000);
    // A Shopee não devolve "state"; ele vai embutido na URL de retorno.
    const redirect = `${redirectUri}?state=${encodeURIComponent(state)}`;
    const q = new URLSearchParams({
      partner_id: c.partnerId,
      timestamp: String(ts),
      sign: assinar(c.partnerKey, c.partnerId, path, ts),
      redirect,
    });
    return `${c.host}${path}?${q}`;
  },

  async conectar(params) {
    const code = params.get("code");
    const shopId = params.get("shop_id");
    if (!code || !shopId) throw new MarketplaceError("Shopee não enviou code/shop_id. Autorize com uma loja (não conta principal).");
    const c = await credenciais();
    const t = await publicCall<TokenResp>("/api/v2/auth/token/get", {
      code,
      shop_id: Number(shopId),
      partner_id: Number(c.partnerId),
    });
    const tokens = toTokens(t);
    const info = await shopCall<ShopeeBase & { shop_name: string }>(
      { idExterno: shopId, accessToken: tokens.accessToken, dados: null },
      "/api/v2/shop/get_shop_info",
    ).catch(() => ({ shop_name: `Loja ${shopId}` }));
    return { ...tokens, idExterno: shopId, nome: info.shop_name };
  },

  async renovar(refreshToken, conta) {
    const c = await credenciais();
    return toTokens(
      await publicCall<TokenResp>("/api/v2/auth/access_token/get", {
        refresh_token: refreshToken,
        shop_id: Number(conta.idExterno),
        partner_id: Number(c.partnerId),
      }),
    );
  },

  async publicar(conta, produto, anuncio) {
    if (!produto.imagens.length) throw new MarketplaceError("A Shopee exige ao menos uma imagem no produto.");
    if (!produto.pesoG) throw new MarketplaceError("Informe o peso do produto para anunciar na Shopee.");

    let categoria = anuncio.categoria ? Number(anuncio.categoria) : undefined;
    if (!categoria) {
      const rec = await shopCall<ShopeeBase & { response: { category_id: number[] } }>(
        conta,
        "/api/v2/product/category_recommend",
        { query: { item_name: anuncio.titulo } },
      );
      categoria = rec.response.category_id[0];
      if (!categoria) throw new MarketplaceError("Shopee não sugeriu categoria; informe o ID da categoria.");
    }

    const canais = await shopCall<ShopeeBase & { response: { logistics_channel_list: { logistics_channel_id: number; enabled: boolean }[] } }>(
      conta,
      "/api/v2/logistics/get_channel_list",
    );
    const logistica = canais.response.logistics_channel_list
      .filter((l) => l.enabled)
      .map((l) => ({ logistic_id: l.logistics_channel_id, enabled: true }));
    if (!logistica.length) throw new MarketplaceError("Nenhum canal de envio ativo na loja Shopee.");

    const imageIds: string[] = [];
    for (const url of produto.imagens.slice(0, 9)) imageIds.push(await enviarImagem(conta, url));

    const r = await shopCall<ShopeeBase & { response: { item_id: number } }>(conta, "/api/v2/product/add_item", {
      method: "POST",
      body: {
        item_name: anuncio.titulo.slice(0, 120),
        description: anuncio.descricao || anuncio.titulo,
        original_price: anuncio.preco,
        seller_stock: [{ stock: Math.max(1, anuncio.estoque) }],
        weight: produto.pesoG / 1000,
        dimension: {
          package_length: Math.max(1, Math.round(produto.comprimentoCm)),
          package_width: Math.max(1, Math.round(produto.larguraCm)),
          package_height: Math.max(1, Math.round(produto.alturaCm)),
        },
        image: { image_id_list: imageIds },
        category_id: categoria,
        logistic_info: logistica,
        item_sku: produto.sku,
        condition: "NEW",
        brand: { brand_id: 0, original_brand_name: "NoBrand" },
      },
    });
    const itemId = String(r.response.item_id);
    return { idExterno: itemId, link: `https://shopee.com.br/product/${conta.idExterno}/${itemId}` };
  },

  async pedidos(conta, desde) {
    // A Shopee aceita janelas de no máximo 15 dias por consulta.
    const sns: string[] = [];
    const agora = Math.floor(Date.now() / 1000);
    for (let from = Math.floor(desde.getTime() / 1000); from < agora; from += 15 * 86400) {
      let cursor = "";
      do {
        const r = await shopCall<ShopeeBase & { response: { order_list: { order_sn: string }[]; more: boolean; next_cursor: string } }>(
          conta,
          "/api/v2/order/get_order_list",
          {
            query: {
              time_range_field: "create_time",
              time_from: String(from),
              time_to: String(Math.min(from + 15 * 86400 - 1, agora)),
              page_size: "100",
              cursor,
            },
          },
        );
        sns.push(...r.response.order_list.map((o) => o.order_sn));
        cursor = r.response.more ? r.response.next_cursor : "";
      } while (cursor);
    }

    type Detalhe = { order_sn: string; order_status: string; total_amount: number; buyer_username: string; create_time: number };
    const out = [];
    for (let i = 0; i < sns.length; i += 50) {
      const r = await shopCall<ShopeeBase & { response: { order_list: Detalhe[] } }>(conta, "/api/v2/order/get_order_detail", {
        query: {
          order_sn_list: sns.slice(i, i + 50).join(","),
          response_optional_fields: "total_amount,buyer_username,order_status",
        },
      });
      out.push(
        ...r.response.order_list.map((o) => ({
          idExterno: o.order_sn,
          status: o.order_status,
          total: o.total_amount,
          comprador: o.buyer_username ?? "",
          data: new Date(o.create_time * 1000),
          dados: o,
        })),
      );
    }
    return out;
  },
};
