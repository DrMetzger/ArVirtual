import "server-only";
import { getSettings } from "@/lib/settings";
import { lerResposta, MarketplaceError, type MarketplaceAdapter, type Tokens } from "./types";

// API aberta do Magalu (https://developers.magalu.com). Login via ID Magalu (OAuth2).
// Escopos e endpoints de seller conforme a documentação pública; confira no portal ao
// criar o app, pois o Magalu libera escopos por conta.
const ID = process.env.MAGALU_ID_URL || "https://id.magalu.com";
const API = "https://api.magalu.com";
// Escopos (developers.magalu.com › APIs › Pedidos / Produtos › overview).
export const MAGALU_SCOPES = [
  "open:order-order-seller:read",
  "open:order-delivery-seller:read",
  "open:order-delivery-seller:write",
  "open:order-invoice-seller:read",
  "open:portfolio-skus-seller:read",
  "open:portfolio-skus-seller:write",
  "open:portfolio-prices-seller:read",
  "open:portfolio-prices-seller:write",
  "open:portfolio-stocks-seller:read",
  "open:portfolio-stocks-seller:write",
].join(" ");

async function credenciais() {
  const s = await getSettings(["magalu.clientId", "magalu.clientSecret"]);
  return { clientId: s["magalu.clientId"], clientSecret: s["magalu.clientSecret"] };
}

type TokenResp = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
const toTokens = (t: TokenResp): Tokens => ({
  accessToken: t.access_token,
  refreshToken: t.refresh_token ?? "",
  expiraEm: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
});

// Troca do código: JSON. Renovação: x-www-form-urlencoded (como na documentação do ID Magalu).
async function token(body: Record<string, string>) {
  const form = body.grant_type === "refresh_token";
  const res = await fetch(`${ID}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json", Accept: "application/json" },
    body: form ? new URLSearchParams(body) : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return lerResposta<TokenResp>(res, "Magalu");
}

async function api<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return lerResposta<T>(res, "Magalu");
}

/** Dados do JWT do ID Magalu: tenant (loja escolhida no consentimento) e nome, quando vierem. */
function dadosDoToken(accessToken: string): { tenant: string; nome: string; payload: Record<string, unknown> } {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>;
    const t = payload.tenant as unknown;
    const tenant =
      typeof t === "object" && t !== null
        ? String((t as Record<string, unknown>).uuid ?? (t as Record<string, unknown>).id ?? "")
        : String(t ?? payload.tenant_id ?? payload.org ?? payload.sub ?? "");
    const nome = String(
      (typeof t === "object" && t !== null ? (t as Record<string, unknown>).legal_name ?? (t as Record<string, unknown>).name : "") ??
        payload.tenant_name ??
        payload.name ??
        "",
    );
    return { tenant, nome, payload };
  } catch {
    return { tenant: "", nome: "", payload: {} };
  }
}

export const magalu: MarketplaceAdapter = {
  id: "magalu",
  nome: "Magalu",

  async configurado() {
    const c = await credenciais();
    return Boolean(c.clientId && c.clientSecret);
  },

  async urlAutorizacao(redirectUri, state) {
    const { clientId } = await credenciais();
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: MAGALU_SCOPES,
      response_type: "code",
      choose_tenants: "true",
      state,
    });
    return `${ID}/login?${q}`;
  },

  async conectar(params, redirectUri) {
    const code = params.get("code");
    if (!code) throw new MarketplaceError("Magalu não enviou o código de autorização.");
    const { clientId, clientSecret } = await credenciais();
    const t = await token({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const d = dadosDoToken(t.access_token);
    const tenant = d.tenant || `magalu-${Date.now()}`;
    return {
      ...toTokens(t),
      idExterno: tenant,
      nome: d.nome || `Loja Magalu ${tenant.slice(0, 8)}`,
      // Guarda o que veio no token (sem assinatura) para conferir tenant e escopos concedidos.
      dados: { escopos: t.scope ?? "", token: d.payload },
    };
  },

  async renovar(refreshToken) {
    const { clientId, clientSecret } = await credenciais();
    return toTokens(
      await token({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    );
  },

  async publicar(conta, produto, anuncio) {
    const sku = await api<{ id?: string; code?: string }>("/seller/v1/portfolios/skus", conta.accessToken, {
      method: "POST",
      body: JSON.stringify({
        code: produto.sku,
        title: anuncio.titulo,
        description: anuncio.descricao,
        brand: "ArVirtual",
        gtin: produto.gtin || undefined,
        images: produto.imagens.map((url) => ({ url })),
        dimensions: {
          weight: { value: produto.pesoG, unit: "g" },
          height: { value: produto.alturaCm, unit: "cm" },
          width: { value: produto.larguraCm, unit: "cm" },
          length: { value: produto.comprimentoCm, unit: "cm" },
        },
        price: { list_price: Math.round(anuncio.preco * 100), price: Math.round(anuncio.preco * 100), normalizer: 100, currency: "BRL" },
        stock: { quantity: Math.max(0, anuncio.estoque) },
        ...(anuncio.categoria ? { category: anuncio.categoria } : {}),
      }),
    });
    return { idExterno: sku.id ?? sku.code ?? produto.sku, link: "https://seller.magalu.com" };
  },

  async pedidos(conta, desde) {
    // Valores da Magalu vêm em inteiros com "normalizer" (100 = centavos).
    type Valor = { value?: number; normalizer?: number } | number | undefined;
    const valor = (v: Valor, normalizer = 100) => (typeof v === "number" ? v / normalizer : (v?.value ?? 0) / (v?.normalizer ?? normalizer));
    type Pedido = {
      id?: string;
      code?: string;
      status?: string;
      created_at?: string;
      purchased_at?: string;
      customer?: { name?: string; document_number?: string; phones?: { number?: string }[] };
      amounts?: { total?: number; normalizer?: number; freight?: Valor };
      deliveries?: {
        shipping?: {
          recipient?: { name?: string; document_number?: string };
          address?: { street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string; zipcode?: string };
        };
        items?: { info?: { sku?: string; id?: string; name?: string }; quantity?: number; unit_price?: Valor }[];
      }[];
    };
    const out = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const q = new URLSearchParams({ _limit: "50", _offset: String(offset), purchased_at__gte: desde.toISOString() });
      const r = await api<{ results?: Pedido[] }>(`/seller/v1/orders?${q}`, conta.accessToken);
      const lista = r.results ?? [];
      out.push(
        ...lista.map((o) => {
          const norm = o.amounts?.normalizer ?? 100;
          const entrega = o.deliveries?.[0]?.shipping;
          const end = entrega?.address;
          return {
            idExterno: String(o.code ?? o.id),
            status: o.status ?? "",
            total: (o.amounts?.total ?? 0) / norm,
            frete: valor(o.amounts?.freight, norm),
            comprador: o.customer?.name ?? "",
            data: new Date(o.purchased_at ?? o.created_at ?? Date.now()),
            itens: (o.deliveries ?? []).flatMap((d) =>
              (d.items ?? []).map((i) => ({
                idAnuncio: i.info?.id ?? i.info?.sku ?? "",
                sku: i.info?.sku ?? "",
                titulo: i.info?.name ?? "",
                quantidade: i.quantity ?? 1,
                valorUnitario: valor(i.unit_price, norm),
              })),
            ),
            entrega: end
              ? {
                  nome: entrega?.recipient?.name ?? o.customer?.name ?? "",
                  documento: entrega?.recipient?.document_number ?? o.customer?.document_number,
                  telefone: o.customer?.phones?.[0]?.number,
                  endereco: [end.street, end.number, end.complement, end.district].filter(Boolean).join(", "),
                  logradouro: end.street,
                  numero: end.number,
                  complemento: end.complement,
                  bairro: end.district,
                  cidade: end.city ?? "",
                  uf: end.state ?? "",
                  cep: end.zipcode ?? "",
                }
              : null,
            dados: o,
          };
        }),
      );
      if (lista.length < 50) break;
    }
    return out;
  },
};
