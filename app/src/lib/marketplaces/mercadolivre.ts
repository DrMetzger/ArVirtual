import "server-only";
import { getSettings } from "@/lib/settings";
import { lerResposta, MarketplaceError, type MarketplaceAdapter, type Tokens } from "./types";

// Documentação: https://developers.mercadolivre.com.br/
const API = "https://api.mercadolibre.com";

async function credenciais() {
  const s = await getSettings(["mercadolivre.clientId", "mercadolivre.clientSecret"]);
  return { clientId: s["mercadolivre.clientId"], clientSecret: s["mercadolivre.clientSecret"] };
}

type TokenResp = { access_token: string; refresh_token: string; expires_in: number; user_id: number };

const toTokens = (t: TokenResp): Tokens => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  expiraEm: new Date(Date.now() + t.expires_in * 1000),
});

async function token(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  return lerResposta<TokenResp>(res, "Mercado Livre");
}

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return lerResposta<T>(res, "Mercado Livre");
}

export const mercadoLivre: MarketplaceAdapter = {
  id: "mercadolivre",
  nome: "Mercado Livre",

  async configurado() {
    const c = await credenciais();
    return Boolean(c.clientId && c.clientSecret);
  },

  async urlAutorizacao(redirectUri, state) {
    const { clientId } = await credenciais();
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state });
    return `https://auth.mercadolivre.com.br/authorization?${q}`;
  },

  async conectar(params, redirectUri) {
    const code = params.get("code");
    if (!code) throw new MarketplaceError("Mercado Livre não enviou o código de autorização.");
    const { clientId, clientSecret } = await credenciais();
    const t = await token({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const me = await api<{ id: number; nickname: string }>("/users/me", t.access_token);
    return { ...toTokens(t), idExterno: String(me.id), nome: me.nickname };
  },

  async renovar(refreshToken) {
    const { clientId, clientSecret } = await credenciais();
    return toTokens(
      await token({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    );
  },

  async publicar(conta, produto, anuncio) {
    let categoria = anuncio.categoria;
    if (!categoria) {
      const sugestoes = await api<{ category_id: string }[]>(
        `/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(anuncio.titulo)}`,
        conta.accessToken,
      );
      categoria = sugestoes[0]?.category_id;
      if (!categoria) throw new MarketplaceError("Mercado Livre não sugeriu categoria; informe o ID da categoria (ex.: MLB1234).");
    }

    const item = await api<{ id: string; permalink: string }>("/items", conta.accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: anuncio.titulo.slice(0, 60),
        category_id: categoria,
        price: anuncio.preco,
        currency_id: "BRL",
        available_quantity: Math.max(1, anuncio.estoque),
        buying_mode: "buy_it_now",
        condition: "new",
        listing_type_id: "gold_special",
        pictures: produto.imagens.map((source) => ({ source })),
        attributes: [
          { id: "SELLER_SKU", value_name: produto.sku },
          { id: "BRAND", value_name: "ArVirtual" },
          { id: "MODEL", value_name: produto.sku },
          ...(produto.gtin ? [{ id: "GTIN", value_name: produto.gtin }] : []),
        ],
      }),
    });

    if (anuncio.descricao) {
      await api(`/items/${item.id}/description`, conta.accessToken, {
        method: "POST",
        body: JSON.stringify({ plain_text: anuncio.descricao }),
      }).catch(() => undefined); // o anúncio já existe; a descrição pode ser ajustada depois
    }
    return { idExterno: item.id, link: item.permalink };
  },

  async pedidos(conta, desde) {
    type Resp = {
      results: {
        id: number;
        status: string;
        total_amount: number;
        date_created: string;
        buyer?: { nickname?: string };
      }[];
    };
    const q = new URLSearchParams({
      seller: conta.idExterno,
      "order.date_created.from": desde.toISOString().replace("Z", "-00:00"),
      sort: "date_desc",
      limit: "50",
    });
    const r = await api<Resp>(`/orders/search?${q}`, conta.accessToken);
    return r.results.map((o) => ({
      idExterno: String(o.id),
      status: o.status,
      total: o.total_amount,
      comprador: o.buyer?.nickname ?? "",
      data: new Date(o.date_created),
      dados: o,
    }));
  },
};
