import "server-only";
import { createHmac } from "node:crypto";
import { getSettings } from "@/lib/settings";
import { aplicarCampos, lerResposta, MarketplaceError, type AnuncioExterno, type ContaComToken, type ItemPedido, type MarketplaceAdapter, type Tokens } from "./types";

// TikTok Shop Partner API (https://partner.tiktokshop.com/docv2):
// - Autorização do vendedor: services.tiktokshop.com/open/authorize?service_id=… → volta com ?code&state.
// - Tokens: auth.tiktok-shops.com/api/v2/token/get|refresh (expire_in = data/hora Unix, não duração).
// - API: open-api.tiktokglobalshop.com, token no cabeçalho x-tts-access-token; toda chamada leva app_key,
//   timestamp (segundos) e sign = HMAC-SHA256(secret, secret + path + chaves em ordem {chave}{valor} + corpo + secret).
// - Loja: shop_cipher (de /authorization/202309/shops) em toda chamada da loja.

const API = process.env.TIKTOK_API_URL || "https://open-api.tiktokglobalshop.com";
const AUTH = process.env.TIKTOK_AUTH_URL || "https://auth.tiktok-shops.com";
const AUTORIZAR = process.env.TIKTOK_AUTORIZAR_URL || "https://services.tiktokshop.com/open/authorize";

async function credenciais() {
  const s = await getSettings(["tiktok.appKey", "tiktok.appSecret", "tiktok.serviceId"]);
  return { appKey: s["tiktok.appKey"].trim(), appSecret: s["tiktok.appSecret"].trim(), serviceId: s["tiktok.serviceId"].trim() };
}

/** Assinatura das chamadas (documento "Sign your API request"). */
export function assinarTikTok(secret: string, path: string, query: Record<string, string>, corpo: string) {
  const base =
    path +
    Object.keys(query)
      .filter((k) => k !== "sign" && k !== "access_token")
      .sort()
      .map((k) => `${k}${query[k]}`)
      .join("") +
    corpo;
  return createHmac("sha256", secret).update(`${secret}${base}${secret}`).digest("hex");
}

type Resposta<T> = { code: number; message: string; data: T; request_id?: string };

async function chamar<T>(
  conta: ContaComToken | null,
  path: string,
  opts: { method?: "GET" | "POST" | "PUT"; query?: Record<string, string>; body?: unknown; semLoja?: boolean } = {},
): Promise<T> {
  const c = await credenciais();
  const cipher = conta?.dados?.cipher;
  const query: Record<string, string> = {
    app_key: c.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(!opts.semLoja && typeof cipher === "string" && cipher ? { shop_cipher: cipher } : {}),
    ...opts.query,
  };
  const corpo = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const q = new URLSearchParams({ ...query, sign: assinarTikTok(c.appSecret, path, query, corpo) });
  const res = await fetch(`${API}${path}?${q}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(conta ? { "x-tts-access-token": conta.accessToken } : {}) },
    body: corpo || undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const r = await lerResposta<Resposta<T>>(res, "TikTok Shop");
  if (r.code !== 0) throw new MarketplaceError(`TikTok Shop: ${r.message || "erro"} (${r.code})`);
  return r.data;
}

type TokenResp = {
  access_token: string;
  access_token_expire_in: number;
  refresh_token: string;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region: string;
};

async function token(params: Record<string, string>): Promise<TokenResp> {
  const c = await credenciais();
  const q = new URLSearchParams({ app_key: c.appKey, app_secret: c.appSecret, ...params });
  const res = await fetch(`${AUTH}/api/v2/token/${params.grant_type === "refresh_token" ? "refresh" : "get"}?${q}`, { signal: AbortSignal.timeout(30_000) });
  const r = await lerResposta<Resposta<TokenResp>>(res, "TikTok Shop");
  if (r.code !== 0 || !r.data?.access_token) throw new MarketplaceError(`TikTok Shop: ${r.message || "não autorizou"} (${r.code})`);
  return r.data;
}

const paraTokens = (t: TokenResp): Tokens => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token,
  // A API devolve a data/hora em que expira (Unix, segundos).
  expiraEm: new Date(t.access_token_expire_in * 1000),
});

/** Estados do Brasil: o TikTok manda o nome por extenso. */
const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB",
  parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
export function ufDe(nome: string, iso = "") {
  const m = iso.toUpperCase().match(/(?:^|-)([A-Z]{2})$/);
  if (m && Object.values(UFS).includes(m[1]!)) return m[1]!;
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return UFS[n] ?? (/^[a-z]{2}$/i.test(nome.trim()) ? nome.trim().toUpperCase() : "");
}

type PedidoTikTok = {
  id: string;
  status: string;
  create_time: number;
  update_time?: number;
  cpf?: string;
  buyer_email?: string;
  payment?: { total_amount?: string; shipping_fee?: string; sub_total?: string; seller_discount?: string };
  recipient_address?: {
    name?: string;
    phone_number?: string;
    full_address?: string;
    address_detail?: string;
    postal_code?: string;
    district_info?: { address_level?: string; address_level_name?: string; address_name?: string; iso_code?: string }[];
  };
  line_items?: { id: string; product_id: string; sku_id: string; product_name: string; seller_sku?: string; sku_name?: string; sale_price?: string; display_status?: string }[];
};

/** Cada line_item do TikTok é UMA unidade: junta por SKU somando a quantidade. */
export function itensTikTok(o: PedidoTikTok): ItemPedido[] {
  const porSku = new Map<string, ItemPedido>();
  for (const l of o.line_items ?? []) {
    if (l.display_status === "CANCELLED") continue;
    const chave = `${l.product_id}|${l.sku_id}`;
    const atual = porSku.get(chave);
    if (atual) atual.quantidade += 1;
    else
      porSku.set(chave, {
        idAnuncio: l.product_id,
        sku: l.seller_sku ?? "",
        titulo: [l.product_name, l.sku_name && l.sku_name !== "Default" ? l.sku_name : ""].filter(Boolean).join(" - "),
        quantidade: 1,
        valorUnitario: Number(l.sale_price ?? 0),
      });
  }
  return [...porSku.values()];
}

export function pedidoTikTok(o: PedidoTikTok) {
  const end = o.recipient_address;
  const nivel = (l: string) => end?.district_info?.find((d) => d.address_level === l);
  const estado = nivel("L1");
  return {
    idExterno: o.id,
    status: o.status,
    total: Number(o.payment?.total_amount ?? 0),
    frete: Number(o.payment?.shipping_fee ?? 0),
    comprador: end?.name ?? "",
    data: new Date(o.create_time * 1000),
    itens: itensTikTok(o),
    // Endereço só vem depois do pagamento (UNPAID/ON_HOLD não trazem).
    entrega: end?.full_address
      ? {
          nome: end.name ?? "",
          documento: o.cpf?.replace(/\D/g, "") || undefined,
          telefone: end.phone_number,
          endereco: end.full_address,
          logradouro: end.address_detail,
          bairro: nivel("L3")?.address_name ?? nivel("L4")?.address_name,
          cidade: nivel("L2")?.address_name ?? "",
          uf: estado ? ufDe(estado.address_name ?? "", estado.iso_code) : "",
          cep: (end.postal_code ?? "").replace(/\D/g, ""),
        }
      : null,
    dados: o,
  };
}

type ProdutoBusca = { id: string; title: string; status: string; skus?: { id: string; seller_sku?: string; price?: { sale_price?: string; tax_exclusive_price?: string } }[] };
type ProdutoDetalhe = {
  id: string;
  title: string;
  status: string;
  main_images?: { urls?: string[] }[];
  skus?: { id: string; seller_sku?: string; inventory?: { warehouse_id: string; quantity: number }[] }[];
};

const linkProduto = (id: string) => `https://www.tiktok.com/view/product/${id}`;

export const tiktok: MarketplaceAdapter = {
  id: "tiktok",
  nome: "TikTok Shop",

  async configurado() {
    const c = await credenciais();
    return Boolean(c.appKey && c.appSecret && c.serviceId);
  },

  async urlAutorizacao(_redirectUri, state) {
    // O retorno vai para a Redirect URL cadastrada no app do Partner Center (a mesma do callback do ERP).
    const c = await credenciais();
    return `${AUTORIZAR}?${new URLSearchParams({ service_id: c.serviceId, state })}`;
  },

  async conectar(params) {
    const code = params.get("code");
    if (!code || code === "null") throw new MarketplaceError(params.get("error") === "auth_denied" ? "Autorização recusada no TikTok Shop." : "TikTok Shop não enviou o código de autorização.");
    const t = await token({ auth_code: code, grant_type: "authorized_code" });
    const tokens = paraTokens(t);
    const { shops } = await chamar<{ shops: { id: string; name: string; region: string; cipher: string; code?: string }[] }>(
      { idExterno: "", accessToken: tokens.accessToken, dados: null },
      "/authorization/202309/shops",
      { semLoja: true },
    );
    const loja = shops.find((s) => s.region === "BR") ?? shops[0];
    if (!loja) throw new MarketplaceError("Nenhuma loja do TikTok Shop autorizada para o app.");
    const conta = { ...tokens, idExterno: loja.id, nome: loja.name || t.seller_name, dados: { cipher: loja.cipher, region: loja.region, code: loja.code ?? "", openId: t.open_id } };
    // Aviso de pedido direto do TikTok para o ERP: o próprio sistema cadastra (nada a configurar no Partner Center).
    await registrarAvisos({ idExterno: loja.id, accessToken: tokens.accessToken, dados: conta.dados }).catch((e: Error) =>
      console.warn(`[tiktok] não registrou o aviso de pedidos: ${e.message}`),
    );
    return conta;
  },

  async renovar(refreshToken) {
    return paraTokens(await token({ refresh_token: refreshToken, grant_type: "refresh_token" }));
  },

  async publicar() {
    throw new MarketplaceError("Publicar no TikTok Shop pelo ERP ainda não está disponível: crie o anúncio no Seller Center e ele aparece aqui sozinho para vincular.");
  },

  async pedidos(conta, { desde, ate, porAtualizacao }) {
    const campo = porAtualizacao ? "update_time" : "create_time";
    const corpo = {
      [`${campo}_ge`]: Math.floor(desde.getTime() / 1000),
      ...(ate ? { [`${campo}_lt`]: Math.floor(ate.getTime() / 1000) } : {}),
    };
    const out = [];
    let pagina = "";
    for (let i = 0; i < 200; i++) {
      const r = await chamar<{ orders?: PedidoTikTok[]; next_page_token?: string }>(conta, "/order/202309/orders/search", {
        query: { page_size: "100", sort_field: "create_time", sort_order: "ASC", ...(pagina ? { page_token: pagina } : {}) },
        body: corpo,
      });
      out.push(...(r.orders ?? []).map(pedidoTikTok));
      pagina = r.next_page_token ?? "";
      if (!pagina || !r.orders?.length) break;
    }
    return out;
  },

  async anuncios(conta) {
    const out: AnuncioExterno[] = [];
    let pagina = "";
    for (let i = 0; i < 100; i++) {
      const r = await chamar<{ products?: ProdutoBusca[]; next_page_token?: string }>(conta, "/product/202502/products/search", {
        query: { page_size: "100", ...(pagina ? { page_token: pagina } : {}) },
        body: {},
      });
      for (const p of r.products ?? []) {
        if (p.status === "DELETED") continue;
        const sku = p.skus?.[0];
        const preco = Number(sku?.price?.sale_price ?? sku?.price?.tax_exclusive_price ?? NaN);
        out.push({
          idExterno: p.id,
          titulo: p.title,
          sku: sku?.seller_sku ?? "",
          preco: Number.isFinite(preco) ? preco : null,
          link: linkProduto(p.id),
          imagem: "",
          status: p.status === "ACTIVATE" ? "ativo" : p.status.toLowerCase(),
        });
      }
      pagina = r.next_page_token ?? "";
      if (!pagina || !r.products?.length) break;
    }
    return out;
  },

  async porSku(conta, skus) {
    if (!skus.length) return [];
    const r = await chamar<{ products?: ProdutoBusca[] }>(conta, "/product/202502/products/search", { query: { page_size: "100" }, body: { seller_skus: skus.slice(0, 100) } });
    return (r.products ?? [])
      .filter((p) => p.status !== "DELETED")
      .map((p) => ({ idExterno: p.id, titulo: p.title, sku: p.skus?.[0]?.seller_sku ?? "", preco: Number(p.skus?.[0]?.price?.sale_price ?? 0) || null, link: linkProduto(p.id), imagem: "", status: p.status === "ACTIVATE" ? "ativo" : p.status.toLowerCase() }));
  },

  async situacao(conta, ids) {
    const out: Record<string, "publicado" | "pausado" | "encerrado"> = {};
    for (const id of ids) {
      const p = await chamar<ProdutoDetalhe>(conta, `/product/202309/products/${id}`).catch((e: Error) => (/not exist|not found|deleted/i.test(e.message) ? null : undefined));
      if (p === undefined) continue;
      out[id] = !p || p.status === "DELETED" ? "encerrado" : p.status === "ACTIVATE" ? "publicado" : "pausado";
    }
    return out;
  },

  async atualizar(conta, id, m) {
    const detalhe = m.estoque !== undefined || m.preco !== undefined ? await chamar<ProdutoDetalhe>(conta, `/product/202309/products/${id}`) : null;
    const sku = detalhe?.skus?.[0];
    const r = await aplicarCampos([
      [
        "estoque",
        m.estoque !== undefined &&
          (() => {
            if (!sku) throw new MarketplaceError("SKU não encontrado no TikTok Shop.");
            const deposito = sku.inventory?.[0]?.warehouse_id;
            return chamar(conta, `/product/202309/products/${id}/inventory/update`, {
              body: { skus: [{ id: sku.id, inventory: [{ ...(deposito ? { warehouse_id: deposito } : {}), quantity: Math.max(0, Math.min(99999, Math.round(m.estoque!))) }] }] },
            });
          }),
      ],
      [
        "preco",
        m.preco !== undefined &&
          (() => {
            if (!sku) throw new MarketplaceError("SKU não encontrado no TikTok Shop.");
            return chamar(conta, `/product/202309/products/${id}/prices/update`, {
              body: { skus: [{ id: sku.id, price: { amount: m.preco!.toFixed(2), currency: "BRL" } }] },
            });
          }),
      ],
    ]);
    for (const campo of ["titulo", "descricao", "fotos", "video"] as const) {
      if (m[campo] !== undefined) r.falhas.push({ campo, motivo: "No TikTok Shop, por enquanto, edite no Seller Center (o ERP atualiza preço e estoque)." });
    }
    return r;
  },
};

/** Cadastra no TikTok o endereço que recebe os avisos de pedido (pedido novo e cada mudança de situação). */
export async function registrarAvisos(conta: ContaComToken) {
  const base = process.env.APP_URL;
  if (!base?.startsWith("https://")) return;
  await chamar(conta, "/event/202309/webhooks", {
    method: "PUT",
    body: { address: `${base}/api/marketplaces/tiktok/notificacoes`, event_type: "ORDER_STATUS_CHANGE" },
  });
}
