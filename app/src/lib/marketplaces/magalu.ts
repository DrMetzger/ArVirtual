import "server-only";
import { getSettings } from "@/lib/settings";
import { aplicarCampos, fotoJpeg, lerResposta, MarketplaceError, type AnuncioExterno, type MarketplaceAdapter, type Tokens } from "./types";

// API aberta do Magalu (https://developers.magalu.com). Login via ID Magalu (OAuth2).
// Escopos e endpoints de seller conforme a documentação pública; confira no portal ao
// criar o app, pois o Magalu libera escopos por conta.
const ID = process.env.MAGALU_ID_URL || "https://id.magalu.com";
const API = process.env.MAGALU_API_URL || "https://api.magalu.com";
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

// Campos aceitos pela atualização completa do SKU (SkuUpdateRequest; o Magalu recusa campos a mais).
const CAMPOS_PUT = [
  "active", "attributes", "brand", "category", "channels", "condition", "datasheet", "description", "dimensions", "extra_data",
  "fulfillment", "group", "has_ean", "identifiers", "images", "metadata", "origin", "ncm", "tax_replacement", "perishable",
  "podcasts", "title", "type", "videos",
];

/** Cadastro do SKU como o GET devolve, só com os campos que o PUT aceita (sem vazios que ele recusa). */
function cadastroCompleto(atual: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_PUT) if (atual[k] !== undefined && atual[k] !== null) out[k] = atual[k];
  if (out.category && typeof out.category === "object" && !Object.keys(out.category).length) delete out.category;
  if (Array.isArray(out.identifiers)) out.identifiers = (out.identifiers as { value?: unknown }[]).filter((i) => i.value);
  for (const k of ["attributes", "datasheet", "dimensions", "images", "videos", "podcasts", "extra_data", "identifiers"]) out[k] ??= [];
  return out;
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
      nome: d.nome || "Loja Magalu",
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
    // Docs: developers.magalu.com › APIs › Produtos (portfolios). O SKU é criado sem preço/estoque;
    // preço e estoque vão em chamadas próprias, no canal da loja (de /portfolios/me).
    const faltam = [
      !produto.imagens.length && "ao menos uma foto",
      !(produto.pesoG > 0) && "peso com embalagem",
      !(produto.alturaCm > 0 && produto.larguraCm > 0 && produto.comprimentoCm > 0) && "altura, largura e comprimento",
    ].filter(Boolean);
    if (faltam.length) throw new MarketplaceError(`Magalu exige ${faltam.join(", ")} no cadastro do produto.`);
    if (produto.sku.length > 32) throw new MarketplaceError("Magalu aceita SKU com até 32 caracteres.");

    const me = await api<{ channel?: { id?: string } }>("/seller/v1/portfolios/me", conta.accessToken);
    const canal = me.channel?.id;
    if (!canal) throw new MarketplaceError("Magalu não informou o canal da loja (portfolios/me).");

    const medida = (v: number) => ({ value: Math.max(0.1, Math.round(v * 10) / 10), unit: "cm" });
    const dim = (name: "product" | "package") => ({
      name,
      height: medida(produto.alturaCm),
      width: medida(produto.larguraCm),
      length: medida(produto.comprimentoCm),
      weight: { value: Math.max(1, Math.round(produto.pesoG)), unit: "g" },
    });
    const ficha = [
      produto.material && { name: "Material", value: produto.material },
      produto.cor && { name: "Cor", value: produto.cor },
      { name: "Fabricação", value: "Impressão 3D" },
    ].filter(Boolean) as { name: string; value: string }[];
    const atributos = Object.entries(produto.atributos ?? {})
      .filter(([k, v]) => k && v)
      .slice(0, 3)
      .map(([name, value]) => ({ name: name.slice(0, 20), value: value.slice(0, 50) }));

    await api("/seller/v1/portfolios/skus", conta.accessToken, {
      method: "POST",
      body: JSON.stringify({
        sku: produto.sku,
        title: anuncio.titulo.slice(0, 150),
        description: (anuncio.descricao || produto.descricao || anuncio.titulo).slice(0, 7000),
        brand: "ArVirtual",
        // Variações do mesmo produto ficam no mesmo grupo (SKU base); produto simples é o próprio grupo.
        group: { id: (anuncio.grupo ?? produto.sku).slice(0, 50), main_variation: anuncio.principal ?? true },
        channels: [{ id: canal }],
        condition: "NEW",
        active: true,
        type: "product",
        has_ean: Boolean(produto.gtin),
        identifiers: produto.gtin ? [{ type: "ean", value: produto.gtin }] : [],
        datasheet: ficha,
        attributes: atributos,
        dimensions: [dim("product"), dim("package")],
        // Magalu só aceita JPEG: PNG/WEBP vão pela rota que converte (/uploads/jpg/...).
        images: produto.imagens.slice(0, 30).map((url) => ({ reference: /\.jpe?g$/i.test(url) ? url : url.replace("/uploads/", "/uploads/jpg/"), type: "image/jpeg" })),
        videos: [],
        podcasts: [],
        extra_data: [],
        ncm: /^\d{8}$/.test(produto.ncm) ? produto.ncm : undefined,
        origin: [1, 2, 3, 6, 7, 8].includes(produto.origem) ? "imported" : "national",
        ...(anuncio.categoria ? { category: { id: anuncio.categoria } } : {}),
      }),
    });

    const centavos = Math.round(anuncio.preco * 100);
    await api(`/seller/v1/portfolios/prices/${encodeURIComponent(produto.sku)}`, conta.accessToken, {
      method: "POST",
      body: JSON.stringify({ channel: { id: canal }, currency: "BRL", normalizer: 100, list_price: centavos, price: centavos }),
    });
    await api(`/seller/v1/portfolios/stocks/${encodeURIComponent(produto.sku)}`, conta.accessToken, {
      method: "POST",
      body: JSON.stringify({ channel: { id: canal }, type: "AVAILABLE", quantity: Math.max(0, anuncio.estoque) }),
    });
    return {
      idExterno: produto.sku,
      link: "https://seller.magalu.com",
      aviso: "O Magalu analisa o cadastro antes de publicar (status Em revisão no Portal do Seller).",
    };
  },

  async atualizar(conta, sku, m) {
    const caminho = (recurso: string) => `/seller/v1/portfolios/${recurso}/${encodeURIComponent(sku)}`;
    const patch = (recurso: string, body: object) => api(caminho(recurso), conta.accessToken, { method: "PATCH", body: JSON.stringify(body) });
    let canal: string | undefined;
    const canalDaLoja = async () =>
      (canal ??= (await api<{ channel?: { id?: string } }>("/seller/v1/portfolios/me", conta.accessToken)).channel?.id) ??
      Promise.reject(new MarketplaceError("Magalu não informou o canal da loja."));
    // Título, descrição e fotos vão juntos numa alteração só: duas alterações seguidas no mesmo SKU fazem o Magalu
    // recusar a segunda ("Product cannot be saved because sku already exists"). Nesse erro, tenta de novo uma vez.
    const cadastro = {
      ...(m.titulo !== undefined ? { title: m.titulo.slice(0, 150) } : {}),
      ...(m.descricao !== undefined ? { description: m.descricao.slice(0, 7000) } : {}),
      // O Magalu só aceita JPEG.
      ...(m.fotos?.length ? { images: m.fotos.slice(0, 30).map((u) => ({ reference: fotoJpeg(u), type: "image/jpeg" })) } : {}),
    };
    const camposCadastro = (["titulo", "descricao", "fotos"] as const).filter((c) => (c === "fotos" ? m.fotos?.length : m[c] !== undefined));
    const r = await aplicarCampos([]);
    if (camposCadastro.length) {
      try {
        // Algumas alterações (ex.: descrição) o PATCH recusa com "sku already exists": aí regrava o cadastro
        // completo (PUT), partindo do que está no Magalu e trocando só o que foi marcado.
        await patch("skus", cadastro).catch(async (e: Error) => {
          if (!/already exists/i.test(e.message)) throw e;
          const atual = await api<Record<string, unknown>>(caminho("skus"), conta.accessToken);
          await api(caminho("skus"), conta.accessToken, { method: "PUT", body: JSON.stringify({ ...cadastroCompleto(atual), ...cadastro }) }).catch((e2: Error) => {
            throw new MarketplaceError(`${e.message} / atualização completa: ${e2.message}`);
          });
        });
        r.feitos.push(...camposCadastro);
      } catch (e) {
        const motivo = (e as Error).message.replace(/^[\w ]+ \(\d+\):\s*/, "");
        r.falhas.push(...camposCadastro.map((campo) => ({ campo, motivo })));
      }
    }
    const resto = await aplicarCampos([
      [
        "preco",
        m.preco !== undefined &&
          (async () => {
            const centavos = Math.round(m.preco! * 100);
            await patch("prices", { channel: { id: await canalDaLoja() }, currency: "BRL", normalizer: 100, list_price: centavos, price: centavos });
          }),
      ],
      ["estoque", m.estoque !== undefined && (async () => patch("stocks", { channel: { id: await canalDaLoja() }, type: "AVAILABLE", quantity: Math.max(0, m.estoque!) }))],
    ]);
    r.feitos.push(...resto.feitos);
    r.falhas.push(...resto.falhas);
    if (r.feitos.some((c) => c === "titulo" || c === "descricao" || c === "fotos")) r.avisos.push("O Magalu analisa a alteração do cadastro antes de mostrar no site.");
    return r;
  },

  async anuncios(conta) {
    // No Magalu o anúncio é o SKU do portfólio (o mesmo que vem nos itens dos pedidos).
    type Sku = {
      sku: string;
      title: string;
      status: string;
      url_marketplace?: { url?: string }[];
      images?: { reference?: string }[];
    };
    const lista: AnuncioExterno[] = [];
    for (let offset = 0; offset < 10_000; offset += 100) {
      const r = await api<{ results: Sku[] }>(`/seller/v1/portfolios/skus?_limit=100&_offset=${offset}`, conta.accessToken);
      for (const s of r.results) {
        if (["DELETED", "DELETING"].includes(s.status)) continue;
        lista.push({
          idExterno: s.sku,
          titulo: s.title,
          sku: s.sku,
          preco: null,
          link: s.url_marketplace?.find((u) => u.url)?.url ?? "https://seller.magalu.com",
          imagem: s.images?.find((i) => i.reference)?.reference ?? "",
          status: { PUBLISHED: "ativo", UNPUBLISHED: "pausado", UNDER_REVIEW: "em revisão", BLOCKED: "bloqueado" }[s.status] ?? s.status,
        });
      }
      if (r.results.length < 100) break;
    }
    return lista;
  },

  async pedidos(conta, { desde, ate, porAtualizacao }) {
    // Valores vêm em inteiros com "normalizer" (100 = centavos): { total | value, normalizer }.
    type Valor = { value?: number; total?: number; normalizer?: number } | number | undefined;
    const valor = (v: Valor, normalizer = 100) =>
      typeof v === "number" ? v / normalizer : (v?.total ?? v?.value ?? 0) / (v?.normalizer ?? normalizer);
    type Endereco = { street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string; zipcode?: string };
    type Entrega = {
      status?: string;
      seller?: { id?: string; name?: string };
      shipping?: {
        recipient?: { name?: string; document_number?: string; address?: Endereco; phones?: { area_code?: string; number?: string }[] };
      };
      items?: { info?: { sku?: string; id?: string; name?: string }; quantity?: number; unit_price?: Valor }[];
    };
    type Pedido = {
      id?: string;
      code?: string;
      status?: string;
      created_at?: string;
      purchased_at?: string;
      customer?: { name?: string; document_number?: string; phones?: { area_code?: string; number?: string }[] };
      amounts?: { total?: number; normalizer?: number; freight?: Valor };
      deliveries?: Entrega[];
    };
    // O status do pedido fica "approved" mesmo depois de enviado; o andamento real está em cada entrega.
    const ORDEM = ["cancelled", "new", "approved", "frozen", "invoiced", "shipped", "delivered"];
    const statusReal = (o: Pedido) => {
      const ents = (o.deliveries ?? []).map((d) => d.status ?? "").filter(Boolean);
      if (!ents.length) return o.status ?? "";
      const ativas = ents.filter((e) => e !== "cancelled");
      if (!ativas.length) return "cancelled";
      return ativas.reduce((m, e) => (ORDEM.indexOf(e) < ORDEM.indexOf(m) ? e : m)); // a entrega mais atrasada manda
    };
    const telefone = (ps?: { area_code?: string; number?: string }[]) => (ps?.[0] ? `${ps[0].area_code ?? ""}${ps[0].number ?? ""}` : undefined);

    const out = [];
    // Pagina até acabar. Na sincronização automática busca por data de atualização (pega envios e entregas de pedidos antigos).
    for (let offset = 0; ; offset += 50) {
      const q = new URLSearchParams({ _limit: "50", _offset: String(offset), _sort: "purchased_at:desc" });
      q.set(porAtualizacao ? "updated_at__gte" : "purchased_at__gte", desde.toISOString());
      if (ate) q.set(porAtualizacao ? "updated_at__lte" : "purchased_at__lte", ate.toISOString());
      const r = await api<{ results?: Pedido[] }>(`/seller/v1/orders?${q}`, conta.accessToken);
      const lista = r.results ?? [];
      out.push(
        ...lista.map((o) => {
          const norm = o.amounts?.normalizer ?? 100;
          const rec = o.deliveries?.find((d) => d.shipping?.recipient)?.shipping?.recipient;
          const end = rec?.address;
          return {
            idExterno: String(o.code ?? o.id),
            status: statusReal(o),
            total: (o.amounts?.total ?? 0) / norm,
            frete: valor(o.amounts?.freight, norm),
            comprador: o.customer?.name ?? rec?.name ?? "",
            data: new Date(o.purchased_at ?? o.created_at ?? Date.now()),
            loja: o.deliveries?.find((d) => d.seller?.name)?.seller?.name,
            itens: (o.deliveries ?? []).flatMap((d) =>
              (d.items ?? []).map((i) => ({
                idAnuncio: i.info?.sku ?? i.info?.id ?? "",
                sku: i.info?.sku ?? "",
                titulo: i.info?.name ?? "",
                quantidade: i.quantity ?? 1,
                valorUnitario: valor(i.unit_price, norm),
              })),
            ),
            entrega: end
              ? {
                  nome: rec?.name ?? o.customer?.name ?? "",
                  documento: rec?.document_number ?? o.customer?.document_number,
                  telefone: telefone(rec?.phones) ?? telefone(o.customer?.phones),
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
      if (lista.length < 50 || offset >= 5000) break;
    }
    return out;
  },

  async notasDoPedido(conta, dados) {
    type Ped = { id?: string; deliveries?: { id?: string }[] };
    let entregas = ((dados as Ped)?.deliveries ?? []).filter((d) => d.id);
    // Pedido salvo sem o id da entrega: busca o pedido de novo.
    if (!entregas.length && (dados as Ped)?.id) {
      const o = await api<Ped>(`/seller/v1/orders/${encodeURIComponent((dados as Ped).id!)}`, conta.accessToken);
      entregas = (o.deliveries ?? []).filter((d) => d.id);
    }
    const out = [];
    for (const d of entregas) {
      type Nota = { key?: string; status?: string | { id?: string }; issued_at?: string; xml?: string };
      const r = await api<{ results?: Nota[] }>(`/seller/v1/deliveries/${encodeURIComponent(d.id!)}/invoices?_limit=20`, conta.accessToken);
      for (const n of r.results ?? []) {
        if (!n.key) continue;
        out.push({
          chave: n.key.replace(/\D/g, ""),
          status: typeof n.status === "string" ? n.status : (n.status?.id ?? ""),
          emitidaEm: n.issued_at ? new Date(n.issued_at) : null,
          xml: n.xml ?? "",
        });
      }
    }
    return out;
  },
};
