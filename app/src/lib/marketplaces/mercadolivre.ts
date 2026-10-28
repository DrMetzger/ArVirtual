import "server-only";
import { getSettings } from "@/lib/settings";
import { aplicarCampos, fotoJpeg, lerResposta, MarketplaceError, type AnuncioExterno, type MarketplaceAdapter, type PedidoExterno, type Tokens } from "./types";

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
    signal: AbortSignal.timeout(30_000),
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

/**
 * O ML só aceita descrição em texto puro: sem emoji, sem HTML e sem caracteres de controle
 * ("The description must be in plain text"). Mantém acentos, quebras de linha e marcadores simples.
 */
export function textoPuroML(s: string) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/[\u2013\u2014\u2022\u00B7\u25CF\u25AA\u2023\u2043]/g, "-")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/^[^\S\n]+/gm, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

    const corpo: Record<string, unknown> = {
      title: anuncio.titulo.slice(0, 60),
      category_id: categoria,
      price: anuncio.preco,
      currency_id: "BRL",
      available_quantity: Math.max(1, anuncio.estoque),
      buying_mode: "buy_it_now",
      condition: "new",
      // Clássico = gold_special; Premium = gold_pro (parcelado sem juros, comissão maior).
      listing_type_id: anuncio.tipoAnuncio === "premium" ? "gold_pro" : "gold_special",
      // Automático: o ML aplica a regra dele (grátis obrigatório a partir de R$ 79). Sempre/nunca: força.
      ...(anuncio.freteGratis === "sempre" || anuncio.freteGratis === "nunca"
        ? { shipping: { mode: "me2", local_pick_up: false, free_shipping: anuncio.freteGratis === "sempre" } }
        : {}),
      pictures: produto.imagens.map((source) => ({ source })),
      attributes: [
        { id: "SELLER_SKU", value_name: produto.sku },
        { id: "BRAND", value_name: "ArVirtual" },
        { id: "MODEL", value_name: produto.sku },
        ...(produto.gtin ? [{ id: "GTIN", value_name: produto.gtin }] : []),
        // Variação: a cor diferencia os itens da mesma família.
        ...(produto.atributos?.Cor ? [{ id: "COLOR", value_name: produto.atributos.Cor }] : []),
      ],
    };
    const publicar = (body: Record<string, unknown>) =>
      api<{ id: string; permalink: string }>("/items", conta.accessToken, { method: "POST", body: JSON.stringify(body) });
    let item: { id: string; permalink: string };
    try {
      item = await publicar(corpo);
    } catch (e) {
      // Contas no modelo "User Products": o anúncio pede family_name (nome da família, que agrupa as variações)
      // e o ML monta o título sozinho.
      if (!/family_name/i.test((e as Error).message)) throw e;
      const { title: _t, ...semTitulo } = corpo;
      const familia = (anuncio.familia ?? anuncio.titulo).slice(0, 60);
      try {
        item = await publicar({ ...semTitulo, family_name: familia });
      } catch (e2) {
        if (!/title/i.test((e2 as Error).message)) throw e2;
        item = await publicar({ ...corpo, family_name: familia });
      }
    }

    if (anuncio.descricao) {
      await api(`/items/${item.id}/description`, conta.accessToken, {
        method: "POST",
        body: JSON.stringify({ plain_text: textoPuroML(anuncio.descricao) }),
      }).catch(() => undefined); // o anúncio já existe; a descrição pode ser ajustada depois
    }
    return { idExterno: item.id, link: item.permalink };
  },

  async atualizar(conta, id, m) {
    const put = (body: object) => api(`/items/${id}`, conta.accessToken, { method: "PUT", body: JSON.stringify(body) });
    const descricao = JSON.stringify({ plain_text: textoPuroML(m.descricao ?? "") });
    return aplicarCampos([
      // O ML não deixa trocar o título depois da primeira venda, nem em anúncios "User Products" (ele monta o título).
      [
        "titulo",
        m.titulo !== undefined &&
          (() =>
            put({ title: m.titulo!.slice(0, 60) }).catch(async (e: Error) => {
              if (!/family_name/i.test(e.message)) throw e;
              // Anúncio do modelo novo (User Products): o ML monta o título a partir do nome da família.
              await put({ family_name: m.titulo!.slice(0, 60) }).catch(() => {
                throw new Error(
                  "anúncio do modelo novo do Mercado Livre: o título é montado pelo próprio ML e não pode ser trocado pela API (só editando o anúncio no site do ML)",
                );
              });
            })),
      ],
      // PUT troca a descrição; anúncio que nunca teve descrição precisa de POST.
      [
        "descricao",
        m.descricao !== undefined &&
          (() =>
            api(`/items/${id}/description`, conta.accessToken, { method: "PUT", body: descricao }).catch(() =>
              api(`/items/${id}/description`, conta.accessToken, { method: "POST", body: descricao }),
            )),
      ],
      ["fotos", m.fotos?.length && (() => put({ pictures: m.fotos!.slice(0, 10).map((u) => ({ source: fotoJpeg(u) })) }))],
      ["preco", m.preco !== undefined && (() => put({ price: m.preco }))],
      ["estoque", m.estoque !== undefined && (() => put({ available_quantity: Math.max(0, m.estoque!) }))],
    ]);
  },

  async anuncios(conta) {
    // search_type=scan: percorre todos os anúncios (a busca normal para em 1.000).
    const ids: string[] = [];
    let scroll = "";
    for (let i = 0; i < 100; i++) {
      const q = new URLSearchParams({ search_type: "scan", limit: "100", ...(scroll ? { scroll_id: scroll } : {}) });
      const r = await api<{ results: string[]; scroll_id?: string }>(`/users/${conta.idExterno}/items/search?${q}`, conta.accessToken);
      if (!r.results.length) break;
      ids.push(...r.results);
      scroll = r.scroll_id ?? "";
      if (!scroll) break;
    }
    type Item = {
      id: string;
      title: string;
      price: number;
      permalink: string;
      status: string;
      thumbnail: string;
      seller_custom_field: string | null;
      attributes?: { id: string; value_name: string | null }[];
    };
    const lista: AnuncioExterno[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const q = new URLSearchParams({ ids: ids.slice(i, i + 20).join(","), attributes: "id,title,price,permalink,status,thumbnail,seller_custom_field,attributes" });
      const r = await api<{ code: number; body: Item }[]>(`/items?${q}`, conta.accessToken);
      for (const { code, body: it } of r) {
        if (code !== 200 || it.status === "closed") continue;
        lista.push({
          idExterno: it.id,
          titulo: it.title,
          sku: it.seller_custom_field || it.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name || "",
          preco: it.price,
          link: it.permalink,
          imagem: it.thumbnail?.replace(/^http:/, "https:") ?? "",
          status: { active: "ativo", paused: "pausado", under_review: "em revisão" }[it.status] ?? it.status,
        });
      }
    }
    return lista;
  },

  async pedidos(conta, { desde, ate, porAtualizacao, reconferir = [] }) {
    type Pedido = {
      id: number;
      status: string;
      total_amount: number;
      paid_amount?: number;
      date_created: string;
      buyer?: { nickname?: string; first_name?: string; last_name?: string };
      shipping?: { id?: number };
      pack_id?: number | null;
      tags?: string[];
      order_items?: { item: { id: string; title: string; seller_sku?: string | null }; quantity: number; unit_price: number }[];
    };
    type Envio = {
      receiver_address?: {
        receiver_name?: string;
        receiver_phone?: string;
        address_line?: string;
        street_name?: string;
        street_number?: string;
        comment?: string;
        neighborhood?: { name?: string };
        zip_code?: string;
        city?: { name?: string };
        state?: { id?: string };
      };
      lead_time?: { cost?: number };
      status?: string;
    };
    // O pedido fica "paid" mesmo depois de enviado/entregue: o andamento real está no envio.
    const statusReal = (o: Pedido, envio: Envio | null) => {
      if (o.status !== "paid" && o.status !== "partially_refunded") return o.status;
      const e = envio?.status ?? "";
      if (e === "delivered" || o.tags?.includes("delivered")) return "delivered";
      if (e === "shipped" || e === "not_delivered") return "shipped";
      return o.status;
    };
    const montar = async (o: Pedido): Promise<PedidoExterno> => {
      // Endereço e frete ficam no envio; sem ele o pedido entra do mesmo jeito.
      const envio = o.shipping?.id ? await api<Envio>(`/shipments/${o.shipping.id}`, conta.accessToken).catch(() => null) : null;
      const end = envio?.receiver_address;
      const fiscal = await api<{ buyer?: { billing_info?: { identification?: { number?: string } } } }>(
        `/orders/${o.id}/billing_info`,
        conta.accessToken,
        { headers: { "x-version": "2" } },
      ).catch(() => null);
      const documento = fiscal?.buyer?.billing_info?.identification?.number;
      return {
        idExterno: String(o.id),
        status: statusReal(o, envio),
        total: o.paid_amount ?? o.total_amount,
        frete: envio?.lead_time?.cost ?? 0,
        comprador: [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(" ") || o.buyer?.nickname || "",
        data: new Date(o.date_created),
        itens: (o.order_items ?? []).map((i) => ({
          idAnuncio: i.item.id,
          sku: i.item.seller_sku ?? "",
          titulo: i.item.title,
          quantidade: i.quantity,
          valorUnitario: i.unit_price,
        })),
        entrega: end
          ? {
              nome: end.receiver_name ?? "",
              documento,
              telefone: end.receiver_phone,
              endereco: end.address_line ?? "",
              logradouro: end.street_name,
              numero: end.street_number,
              complemento: end.comment,
              bairro: end.neighborhood?.name,
              cidade: end.city?.name ?? "",
              uf: (end.state?.id ?? "").replace(/^BR-/, ""),
              cep: end.zip_code ?? "",
            }
          : null,
        dados: { pedido: o, envio, fiscal },
      };
    };
    const out: PedidoExterno[] = [];
    for (let offset = 0; offset < 5000; offset += 50) {
      const q = new URLSearchParams({
        seller: conta.idExterno,
        [porAtualizacao ? "order.date_last_updated.from" : "order.date_created.from"]: desde.toISOString().replace("Z", "-00:00"),
        ...(ate ? { [porAtualizacao ? "order.date_last_updated.to" : "order.date_created.to"]: ate.toISOString().replace("Z", "-00:00") } : {}),
        sort: "date_desc",
        limit: "50",
        offset: String(offset),
      });
      const r = await api<{ results: Pedido[]; paging?: { total?: number } }>(`/orders/search?${q}`, conta.accessToken);
      for (const o of r.results) out.push(await montar(o));
      if (r.results.length < 50) break;
    }
    // Pedidos ainda em aberto que a busca por atualização não trouxe: o ML nem sempre marca o pedido
    // como alterado quando só o envio muda (enviado/entregue). Confere um a um.
    for (const id of reconferir.filter((id) => !out.some((p) => p.idExterno === id))) {
      const o = await api<Pedido>(`/orders/${id}`, conta.accessToken).catch(() => null);
      if (o) out.push(await montar(o));
    }
    return out;
  },
};
