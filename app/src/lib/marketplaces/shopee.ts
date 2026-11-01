import "server-only";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { getSettings } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/uploads";
import { aplicarCampos, lerResposta, MarketplaceError, type AnuncioExterno, type ContaComToken, type MarketplaceAdapter, type Tokens } from "./types";

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
    signal: AbortSignal.timeout(30_000),
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

/**
 * Sobe a foto para a Shopee. Ela só aceita JPG/PNG de até 10 MB e recusa WEBP ("image is invalid or not supported"):
 * toda foto vai convertida para JPEG (fundo branco onde era transparente), entre 500 e 2000 px.
 */
async function enviarImagem(conta: ContaComToken, url: string) {
  const nome = url.match(/\/uploads\/([a-z0-9-]+\.(?:jpg|png|webp))$/)?.[1];
  // Foto do próprio ERP: lê do disco (não depende do site público responder a ele mesmo).
  const original = nome
    ? await readFile(`${UPLOAD_DIR}/${nome}`).catch(() => null)
    : await fetch(url, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  if (!original) throw new MarketplaceError(`Não foi possível ler a imagem ${url}`);
  let jpeg: Buffer;
  try {
    const img = sharp(Buffer.from(original as ArrayBuffer)).rotate();
    const { width = 0, height = 0 } = await img.metadata();
    const menor = Math.min(width, height);
    jpeg = await img
      .resize(menor && menor < 500 ? { width: width <= height ? 500 : undefined, height: height < width ? 500 : undefined } : { width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new MarketplaceError(`A imagem ${url} está corrompida ou num formato desconhecido.`);
  }
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "imagem.jpg");
  const r = await shopCall<ShopeeBase & { response: { image_info: { image_id: string } } }>(
    conta,
    "/api/v2/media_space/upload_image",
    { method: "POST", form },
  );
  return r.response.image_info.image_id;
}

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const PARTE_VIDEO = 4 * 1024 * 1024;

/** Sobe o vídeo pela API de mídia (init → partes de 4 MB → complete) e espera a Shopee processar. */
async function enviarVideo(conta: ContaComToken, url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new MarketplaceError(`Não foi possível baixar o vídeo ${url}`);
  const video = Buffer.from(await res.arrayBuffer());
  const inicio = Date.now();

  const init = await shopCall<ShopeeBase & { response: { video_upload_id: string } }>(conta, "/api/v2/media_space/init_video_upload", {
    method: "POST",
    body: { file_md5: md5(video), file_size: video.length },
  });
  const id = init.response.video_upload_id;
  const partes: number[] = [];
  for (let seq = 0, pos = 0; pos < video.length; seq++, pos += PARTE_VIDEO) {
    const parte = video.subarray(pos, pos + PARTE_VIDEO);
    const form = new FormData();
    form.append("video_upload_id", id);
    form.append("part_seq", String(seq));
    form.append("content_md5", md5(parte));
    form.append("part_content", new Blob([new Uint8Array(parte)]), "video.mp4");
    await shopCall(conta, "/api/v2/media_space/upload_video_part", { method: "POST", form });
    partes.push(seq);
  }
  await shopCall(conta, "/api/v2/media_space/complete_video_upload", {
    method: "POST",
    body: { video_upload_id: id, part_seq_list: partes, report_data: { upload_cost: Date.now() - inicio } },
  });

  // A Shopee converte o vídeo antes de liberar para o anúncio.
  for (let i = 0; i < 20; i++) {
    const r = await shopCall<ShopeeBase & { response: { status: string; message?: string } }>(conta, "/api/v2/media_space/get_video_upload_result", {
      query: { video_upload_id: id },
    });
    if (r.response.status === "SUCCEEDED") return id;
    if (r.response.status === "FAILED") throw new MarketplaceError(`Shopee recusou o vídeo: ${r.response.message || "falha na conversão"}`);
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new MarketplaceError("A Shopee ainda está processando o vídeo; publique de novo em alguns minutos.");
}

type AtributoShopee = { id: number; nome: string; obrigatorio: boolean; textoLivre: boolean; valores: { id: number; nome: string }[] };

/**
 * Atributos da categoria (Connection Type, Material...). Lê a árvore de atributos (API nova) e, se ela não vier,
 * a lista antiga; aceita os dois formatos de resposta.
 */
async function atributosDaCategoria(conta: ContaComToken, categoria: number): Promise<AtributoShopee[]> {
  type Bruto = Record<string, unknown> & { attribute_id: number; attribute_value_list?: Record<string, unknown>[] };
  const nomeDe = (o: Record<string, unknown>, ...chaves: string[]) => {
    for (const k of chaves) if (typeof o[k] === "string" && o[k]) return o[k] as string;
    const ml = (o.multi_lang as { language?: string; value?: string }[] | undefined)?.find((m) => /pt/i.test(m.language ?? ""));
    return ml?.value ?? "";
  };
  const normalizar = (lista: Bruto[]): AtributoShopee[] =>
    lista.map((a) => {
      const info = (a.attribute_info ?? {}) as { input_type?: number | string };
      const tipo = String(info.input_type ?? a.input_type ?? a.attribute_type ?? "");
      return {
        id: a.attribute_id,
        nome: nomeDe(a, "display_attribute_name", "name", "attribute_name", "original_attribute_name"),
        obrigatorio: Boolean(a.mandatory ?? a.is_mandatory),
        // Texto livre ou combo (lista + valor digitado): 2/3/5 na API nova; TEXT_FILED/COMBO_BOX na antiga.
        textoLivre: /^(2|3|5)$|TEXT|COMBO/i.test(tipo) || !(a.attribute_value_list ?? []).length,
        valores: (a.attribute_value_list ?? []).map((v) => ({
          id: Number(v.value_id),
          nome: nomeDe(v, "display_value_name", "name", "original_value_name", "value_name"),
        })),
      };
    });
  try {
    const r = await shopCall<ShopeeBase & { response: { list?: { attribute_tree?: Bruto[] }[]; attribute_list?: Bruto[]; attribute_tree?: Bruto[] } }>(
      conta,
      "/api/v2/product/get_attribute_tree",
      { query: { category_id_list: String(categoria), language: "pt-br" } },
    );
    const lista = r.response.list?.[0]?.attribute_tree ?? r.response.attribute_tree ?? r.response.attribute_list;
    if (lista?.length) return normalizar(lista);
  } catch {
    // cai para a API antiga
  }
  const r = await shopCall<ShopeeBase & { response: { attribute_list?: Bruto[] } }>(conta, "/api/v2/product/get_attributes", {
    query: { category_id: String(categoria), language: "pt-br" },
  });
  return normalizar(r.response.attribute_list ?? []);
}

const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Preenche os atributos obrigatórios da categoria: primeiro com os dados do produto (cor, material),
 * senão com a opção neutra da lista ("Outros", "Não se aplica"...) ou a primeira. Devolve o que escolheu, para avisar.
 */
function preencherObrigatorios(
  atributos: AtributoShopee[],
  produto: { cor: string; material: string; atributos: Record<string, string> | null },
  daTela: Record<string, string> = {},
) {
  const doProduto: Record<string, string> = {
    cor: produto.cor,
    color: produto.cor,
    colour: produto.cor,
    material: produto.material,
    marca: "ArVirtual",
    brand: "ArVirtual",
    ...Object.fromEntries(Object.entries(produto.atributos ?? {}).map(([k, v]) => [sem(k), v])),
    ...Object.fromEntries(Object.entries(daTela).map(([k, v]) => [sem(k), v])),
  };
  const NEUTRAS = /^(outros?|others?|nao se aplica|n\/a|nenhum|none|sem marca|no brand|nobrand|universal|nao|generic[oa]?)$/;
  const lista: { attribute_id: number; attribute_value_list: { value_id: number; original_value_name?: string }[] }[] = [];
  const escolhidos: string[] = [];
  for (const a of atributos.filter((x) => x.obrigatorio)) {
    const desejado = doProduto[sem(a.nome)] ?? "";
    // Igual, ou a palavra inteira dentro do nome da opção ("Preto" casa com "Preto Fosco"; "PLA" não casa com "Plástico").
    const palavras = (t: string) => sem(t).split(/[^a-z0-9]+/).filter(Boolean);
    const igual = desejado
      ? (a.valores.find((v) => sem(v.nome) === sem(desejado)) ??
        a.valores.find((v) => palavras(desejado).every((p) => palavras(v.nome).includes(p))))
      : undefined;
    const valor = igual ?? (desejado && a.textoLivre ? undefined : a.valores.find((v) => NEUTRAS.test(sem(v.nome))) ?? a.valores[0]);
    if (valor) {
      lista.push({ attribute_id: a.id, attribute_value_list: [{ value_id: valor.id }] });
      escolhidos.push(`${a.nome} = ${valor.nome}`);
    } else {
      const texto = desejado || "Não se aplica";
      lista.push({ attribute_id: a.id, attribute_value_list: [{ value_id: 0, original_value_name: texto }] });
      escolhidos.push(`${a.nome} = ${texto}`);
    }
  }
  return { lista, escolhidos };
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

    // Atributos obrigatórios da categoria (ex.: "Connection Type" em acessórios de games).
    const { lista: atributos, escolhidos } = preencherObrigatorios(await atributosDaCategoria(conta, categoria).catch(() => []), produto, anuncio.atributos);

    const imageIds: string[] = [];
    for (const url of produto.imagens.slice(0, 9)) imageIds.push(await enviarImagem(conta, url));

    // Vídeo é opcional: se falhar, o anúncio sai sem ele e a tela avisa.
    let videoId: string | null = null;
    let aviso: string | undefined;
    if (produto.videos[0]) {
      try {
        videoId = await enviarVideo(conta, produto.videos[0]);
      } catch (e) {
        aviso = `Anúncio publicado sem vídeo: ${(e as Error).message}`;
      }
    }

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
        ...(atributos.length ? { attribute_list: atributos } : {}),
        ...(videoId ? { video_upload_id: [videoId] } : {}),
      },
    });
    const itemId = String(r.response.item_id);
    if (escolhidos.length) {
      aviso = [aviso, `Atributos obrigatórios preenchidos automaticamente: ${escolhidos.join("; ")}. Confira no anúncio da Shopee.`].filter(Boolean).join(" ");
    }
    return { idExterno: itemId, link: `https://shopee.com.br/product/${conta.idExterno}/${itemId}`, aviso };
  },

  async atualizar(conta, id, m) {
    const itemId = Number(id);
    const atualizarItem = (body: object) => shopCall(conta, "/api/v2/product/update_item", { method: "POST", body: { item_id: itemId, ...body } });
    return aplicarCampos([
      ["titulo", m.titulo !== undefined && (() => atualizarItem({ item_name: m.titulo!.slice(0, 120) }))],
      ["descricao", m.descricao !== undefined && (() => atualizarItem({ description: m.descricao!.slice(0, 3000) }))],
      [
        "fotos",
        m.fotos?.length &&
          (async () => {
            const ids: string[] = [];
            for (const u of m.fotos!.slice(0, 9)) ids.push(await enviarImagem(conta, u));
            await atualizarItem({ image: { image_id_list: ids } });
          }),
      ],
      ["video", m.video && (async () => atualizarItem({ video_upload_id: [await enviarVideo(conta, m.video!)] }))],
      // Anúncios publicados pelo ERP não têm modelos (cada variação é um item): model_id 0.
      ["preco", m.preco !== undefined && (() => shopCall(conta, "/api/v2/product/update_price", { method: "POST", body: { item_id: itemId, price_list: [{ model_id: 0, original_price: m.preco }] } }))],
      [
        "estoque",
        m.estoque !== undefined &&
          (() =>
            shopCall(conta, "/api/v2/product/update_stock", {
              method: "POST",
              body: { item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock: Math.max(0, m.estoque!) }] }] },
            })),
      ],
    ]);
  },

  async anuncios(conta) {
    const ids: { id: number; status: string }[] = [];
    for (const status of ["NORMAL", "UNLIST"]) {
      for (let offset = 0; offset < 10_000; ) {
        const r = await shopCall<ShopeeBase & { response: { item?: { item_id: number }[]; has_next_page: boolean; next_offset: number } }>(
          conta,
          "/api/v2/product/get_item_list",
          { query: { offset: String(offset), page_size: "100", item_status: status } },
        );
        ids.push(...(r.response.item ?? []).map((i) => ({ id: i.item_id, status })));
        if (!r.response.has_next_page) break;
        offset = r.response.next_offset;
      }
    }
    type Item = { item_id: number; item_name: string; item_sku?: string; price_info?: { current_price: number }[]; image?: { image_url_list?: string[] } };
    const lista: AnuncioExterno[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      const r = await shopCall<ShopeeBase & { response: { item_list: Item[] } }>(conta, "/api/v2/product/get_item_base_info", {
        query: { item_id_list: lote.map((x) => x.id).join(",") },
      });
      for (const it of r.response.item_list ?? []) {
        lista.push({
          idExterno: String(it.item_id),
          titulo: it.item_name,
          sku: it.item_sku ?? "",
          preco: it.price_info?.[0]?.current_price ?? null,
          link: `https://shopee.com.br/product/${conta.idExterno}/${it.item_id}`,
          imagem: it.image?.image_url_list?.[0] ?? "",
          status: lote.find((x) => x.id === it.item_id)?.status === "UNLIST" ? "pausado" : "ativo",
        });
      }
    }
    return lista;
  },

  async metricas(conta, ids) {
    const out: Record<string, { visitas: number; curtidas: number }> = {};
    for (let i = 0; i < ids.length; i += 50) {
      const r = await shopCall<ShopeeBase & { response?: { item_list?: { item_id: number; views?: number; likes?: number }[] } }>(conta, "/api/v2/product/get_item_extra_info", {
        query: { item_id_list: ids.slice(i, i + 50).join(",") },
      }).catch(() => null);
      for (const it of r?.response?.item_list ?? []) out[String(it.item_id)] = { visitas: Number(it.views) || 0, curtidas: Number(it.likes) || 0 };
    }
    return out;
  },

  async taxas(conta, idExterno, dados) {
    // Detalhe do repasse (escrow): comissão, taxa de serviço, transação, AMS/campanha e frete. Só fecha quando o
    // pedido conclui (escrow_amount > 0); antes disso o ERP lê de novo nas próximas rodadas.
    const status = (dados as { order_status?: string } | null)?.order_status;
    if (status === "CANCELLED" || status === "UNPAID") return { taxas: 0, freteVendedor: 0, final: status === "CANCELLED" };
    const r = await shopCall<ShopeeBase & { response?: { order_income?: Record<string, number> } }>(conta, "/api/v2/payment/get_escrow_detail", { query: { order_sn: idExterno } });
    const inc = r.response?.order_income ?? {};
    const n = (k: string) => Number(inc[k]) || 0;
    const taxas = ["commission_fee", "service_fee", "seller_transaction_fee", "credit_card_transaction_fee", "order_ams_commission_fee", "campaign_fee", "seller_order_processing_fee", "fbs_fee"].reduce((s, k) => s + Math.abs(n(k)), 0);
    // Frete do vendedor: o que a Shopee cobrou de frete menos o que o comprador pagou e o subsídio da Shopee.
    const freteVendedor = Math.max(0, n("actual_shipping_fee") - n("buyer_paid_shipping_fee") - n("shopee_shipping_rebate"));
    return { taxas: Math.round(taxas * 100) / 100, freteVendedor: Math.round(freteVendedor * 100) / 100, final: n("escrow_amount") > 0 };
  },

  async pedidos(conta, { desde, ate, porAtualizacao }) {
    // A Shopee aceita janelas de no máximo 15 dias por consulta.
    const sns: string[] = [];
    const agora = Math.floor(Math.min(Date.now(), ate?.getTime() ?? Infinity) / 1000);
    for (let from = Math.floor(desde.getTime() / 1000); from < agora; from += 15 * 86400) {
      let cursor = "";
      do {
        const r = await shopCall<ShopeeBase & { response: { order_list: { order_sn: string }[]; more: boolean; next_cursor: string } }>(
          conta,
          "/api/v2/order/get_order_list",
          {
            query: {
              time_range_field: porAtualizacao ? "update_time" : "create_time",
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

    type Detalhe = {
      order_sn: string;
      order_status: string;
      total_amount: number;
      buyer_username: string;
      create_time: number;
      actual_shipping_fee?: number;
      estimated_shipping_fee?: number;
      buyer_cpf_id?: string;
      item_list?: { item_id: number; item_name: string; item_sku?: string; model_sku?: string; model_quantity_purchased: number; model_discounted_price: number }[];
      recipient_address?: { name?: string; phone?: string; full_address?: string; city?: string; state?: string; zipcode?: string };
    };
    const out = [];
    for (let i = 0; i < sns.length; i += 50) {
      const r = await shopCall<ShopeeBase & { response: { order_list: Detalhe[] } }>(conta, "/api/v2/order/get_order_detail", {
        query: {
          order_sn_list: sns.slice(i, i + 50).join(","),
          response_optional_fields:
            "total_amount,buyer_username,order_status,item_list,recipient_address,actual_shipping_fee,estimated_shipping_fee,buyer_cpf_id",
        },
      });
      out.push(
        ...r.response.order_list.map((o) => {
          const end = o.recipient_address;
          return {
            idExterno: o.order_sn,
            status: o.order_status,
            total: o.total_amount,
            frete: o.actual_shipping_fee ?? o.estimated_shipping_fee ?? 0,
            comprador: end?.name || o.buyer_username || "",
            data: new Date(o.create_time * 1000),
            itens: (o.item_list ?? []).map((it) => ({
              idAnuncio: String(it.item_id),
              sku: it.model_sku || it.item_sku || "",
              titulo: it.item_name,
              quantidade: it.model_quantity_purchased,
              valorUnitario: it.model_discounted_price,
            })),
            entrega: end
              ? {
                  nome: end.name ?? "",
                  documento: o.buyer_cpf_id,
                  telefone: end.phone,
                  endereco: end.full_address ?? "",
                  cidade: end.city ?? "",
                  uf: end.state ?? "",
                  cep: end.zipcode ?? "",
                }
              : null,
            dados: o,
          };
        }),
      );
    }
    return out;
  },
};
