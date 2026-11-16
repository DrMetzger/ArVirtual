import type { Marketplace, Produto } from "@/db/schema";

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiraEm: Date | null;
};

export type ContaConectada = Tokens & {
  idExterno: string;
  nome: string;
  dados?: Record<string, unknown>;
};

export type ContaComToken = { idExterno: string; accessToken: string; dados: Record<string, unknown> | null };

export type DadosAnuncio = {
  titulo: string;
  descricao: string;
  preco: number;
  estoque: number;
  categoria?: string;
  /** Variação: SKU base do produto principal (agrupa as cores no mesmo anúncio) e se é a variação principal. */
  grupo?: string;
  principal?: boolean;
  /** Mercado Livre (User Products): nome da família, igual para todas as variações. */
  familia?: string;
  /** Mercado Livre: Clássico ou Premium; frete grátis automático (regra do ML), sempre ou nunca. */
  tipoAnuncio?: "classico" | "premium";
  freteGratis?: "automatico" | "sempre" | "nunca";
  /** Atributos informados na tela (ex.: { "Connection Type": "Com fio" }), usados nos obrigatórios da categoria. */
  atributos?: Record<string, string>;
};

export type FiltroPedidos = {
  desde: Date;
  /** Sem `ate`: até agora. */
  ate?: Date;
  porAtualizacao?: boolean;
  /** Pedidos ainda em aberto para conferir um a um (o ML nem sempre marca como alterado quando só o envio muda). */
  reconferir?: string[];
};

export const CAMPOS_ANUNCIO = {
  titulo: "Título",
  descricao: "Descrição",
  fotos: "Fotos",
  preco: "Preço",
  estoque: "Estoque",
  video: "Vídeo",
} as const;
export type CampoAnuncio = keyof typeof CAMPOS_ANUNCIO;

export type MudancasAnuncio = {
  titulo?: string;
  descricao?: string;
  /** URLs públicas das fotos, na ordem (a primeira é a capa). */
  fotos?: string[];
  preco?: number;
  estoque?: number;
  /** URL do vídeo MP4 (só a Shopee aceita vídeo pela API). */
  video?: string;
};

export type ResultadoAtualizacao = { feitos: CampoAnuncio[]; falhas: { campo: CampoAnuncio; motivo: string }[]; avisos: string[] };

/** Roda cada campo pedido separadamente e junta o que deu certo e o que a plataforma recusou. */
export async function aplicarCampos(passos: [CampoAnuncio, (() => Promise<unknown>) | false | 0 | "" | undefined][]): Promise<ResultadoAtualizacao> {
  const r: ResultadoAtualizacao = { feitos: [], falhas: [], avisos: [] };
  for (const [campo, passo] of passos) {
    if (!passo) continue;
    try {
      await passo();
      r.feitos.push(campo);
    } catch (e) {
      r.falhas.push({ campo, motivo: (e as Error).message.replace(/^[\w ]+ \(\d+\):\s*/, "") });
    }
  }
  return r;
}

/** Foto em JPEG para quem não aceita PNG/WEBP (rota que converte na hora). */
export const fotoJpeg = (url: string) => (/\.jpe?g$/i.test(url) ? url : url.replace("/uploads/", "/uploads/jpg/"));

export type ResultadoAnuncio = { idExterno: string; link: string; aviso?: string };

/** Anúncio que já existe na conta do marketplace (criado lá ou em outro sistema). */
export type AnuncioExterno = {
  idExterno: string;
  titulo: string;
  sku: string;
  preco: number | null;
  link: string;
  imagem: string;
  /** Ativo, pausado etc., como o marketplace informa. */
  status: string;
};

export type ItemPedido = {
  /** ID do anúncio/item no marketplace (liga ao cadastro pelo histórico de anúncios). */
  idAnuncio: string;
  sku: string;
  titulo: string;
  quantidade: number;
  valorUnitario: number;
};

export type EntregaPedido = {
  nome: string;
  documento?: string;
  telefone?: string;
  /** Endereço como o marketplace mostra; as partes abaixo vêm quando a API as separa. */
  endereco: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type PedidoExterno = {
  idExterno: string;
  status: string;
  total: number;
  frete: number;
  comprador: string;
  data: Date;
  itens: ItemPedido[];
  entrega: EntregaPedido | null;
  /** Nome da loja no marketplace, quando o pedido informa (usado para nomear a conta). */
  loja?: string;
  dados: unknown;
};

export type DadosRaioX = {
  visitas?: number;
  periodo?: "30d" | "total";
  vendasTotal?: number;
  fotos?: number;
  premium?: boolean;
  freteGratis?: boolean;
  qualidade?: { nota: number; nivel: string; acoes: string[] };
};

export type MetricasAnuncio = { visitas: number; curtidas: number };
export type SituacaoAnuncio = "publicado" | "pausado" | "encerrado";
/** Taxas do pedido; `final` = valor fechado (enquanto não, é parcial e é lido de novo depois). */
export type TaxasPedido = { taxas: number; freteVendedor: number; final: boolean };

/** NF-e que o vendedor informou ao marketplace (emitida em outro sistema). */
/** NF-e autorizada no ERP, para mandar ao marketplace. */
export type NotaParaEnviar = { chave: string; xml: string; valor: number; emitidaEm: Date; cnpjEmitente: string };

export type NotaDoPedido = { chave: string; status: string; emitidaEm: Date | null; xml: string };

/** Dados de um anúncio para criar o produto no ERP a partir do link (importador). */
export type DadosImportados = {
  titulo: string;
  descricao: string;
  fotos: string[];
  videos: string[];
  preco?: number;
  sku?: string;
  gtin?: string;
  ncm?: string;
  pesoG?: number;
  alturaCm?: number;
  larguraCm?: number;
  comprimentoCm?: number;
  /** Anúncio da própria conta: o produto nasce vinculado a ele (não duplica depois). */
  idExterno?: string;
  link?: string;
};

export interface MarketplaceAdapter {
  id: Marketplace;
  nome: string;
  /** Credenciais do app (client id/secret) cadastradas em Configurações. */
  configurado(): Promise<boolean>;
  urlAutorizacao(redirectUri: string, state: string): Promise<string>;
  /** Recebe os parâmetros do callback OAuth e devolve a conta conectada. */
  conectar(params: URLSearchParams, redirectUri: string): Promise<ContaConectada>;
  renovar(refreshToken: string, conta: ContaComToken): Promise<Tokens>;
  publicar(conta: ContaComToken, produto: Produto, anuncio: DadosAnuncio): Promise<ResultadoAnuncio>;
  /** Pedidos comprados entre `desde` e `ate` ou, com `porAtualizacao`, alterados nesse intervalo (sincronização automática). */
  pedidos(conta: ContaComToken, filtro: FiltroPedidos): Promise<PedidoExterno[]>;
  /** Visualizações e curtidas dos anúncios (id externo → números). */
  metricas?(conta: ContaComToken, ids: string[]): Promise<Record<string, MetricasAnuncio>>;
  /** Dados completos de um anúncio pelo link (null se o link não é deste marketplace ou não é da conta). */
  importar?(conta: ContaComToken, link: string): Promise<DadosImportados | null>;
  /** Situação atual dos anúncios no marketplace (só os que deu para conferir; os que não existem mais vêm "encerrado"). */
  situacao?(conta: ContaComToken, ids: string[]): Promise<Record<string, SituacaoAnuncio>>;
  /** Taxas que o marketplace cobrou no pedido (`dados` é o pedido como a API devolveu). */
  taxas?(conta: ContaComToken, idExterno: string, dados: unknown): Promise<TaxasPedido>;
  /** Notas fiscais informadas no marketplace para o pedido (`dados` é o pedido como a API devolveu). */
  notasDoPedido?(conta: ContaComToken, dados: unknown): Promise<NotaDoPedido[]>;
  /** Informa ao marketplace a NF-e emitida no ERP para o pedido (`dados` é o pedido como a API devolveu). */
  enviarNota?(conta: ContaComToken, dados: unknown, nota: NotaParaEnviar): Promise<void>;
  /** Etiqueta de envio do pedido em PDF (`dados` é o pedido como a API devolveu). */
  etiqueta?(conta: ContaComToken, dados: unknown): Promise<Buffer>;
  /**
   * Raio-X de cada anúncio (só o que a plataforma informa): visitas e período, vendas totais, fotos, Premium, frete grátis
   * e a qualidade com as ações recomendadas (ML).
   */
  raiox?(conta: ContaComToken, ids: string[]): Promise<Record<string, DadosRaioX>>;
  /** Anúncios existentes na conta, para vincular aos produtos do cadastro. */
  anuncios(conta: ContaComToken): Promise<AnuncioExterno[]>;
  /** Anúncios da conta com estes SKUs (busca direta, sem listar a conta toda). */
  porSku?(conta: ContaComToken, skus: string[]): Promise<AnuncioExterno[]>;
  /** Comissão da categoria da plataforma para um produto (termo de busca) — Mercado Livre: domain_discovery + listing_prices. */
  tarifa?(conta: ContaComToken, termo: string): Promise<TarifaCategoria | null>;
  /**
   * Troca, num anúncio que já existe, só o que vier em `mudancas`. Cada campo vai separado: o que a plataforma
   * recusar volta como falha (com o motivo) e não impede os outros.
   */
  atualizar(conta: ContaComToken, idExterno: string, mudancas: MudancasAnuncio): Promise<ResultadoAtualizacao>;
}

export class MarketplaceError extends Error {}

export async function lerResposta<T>(res: Response, origem: string): Promise<T> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // resposta não-JSON
  }
  if (!res.ok) {
    const b = body as Record<string, unknown>;
    const causas = Array.isArray(b?.cause)
      ? (b.cause as { message?: string }[]).map((c) => c.message).filter(Boolean).join("; ")
      : "";
    // Validação no padrão FastAPI (Magalu): { detail: [{ loc: ["body", "campo"], msg }] }.
    const detalhe = Array.isArray(b?.detail)
      ? (b.detail as { loc?: (string | number)[]; msg?: string }[])
          .map((d) => `${(d.loc ?? []).filter((x) => x !== "body").join(".")}: ${d.msg ?? ""}`)
          .join("; ")
      : typeof b?.detail === "string"
        ? b.detail
        : "";
    const msg = [b?.message, b?.error_description, b?.error, causas, detalhe].filter(Boolean).join(" · ");
    throw new MarketplaceError(`${origem} (${res.status}): ${msg || text.slice(0, 300)}`);
  }
  return body as T;
}

export type TarifaCategoria = { categoriaId: string; categoria: string; classico: number; premium: number };
