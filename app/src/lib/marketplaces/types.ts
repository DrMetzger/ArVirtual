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
};

export type FiltroPedidos = {
  desde: Date;
  /** Sem `ate`: até agora. */
  ate?: Date;
  porAtualizacao?: boolean;
  /** Pedidos ainda em aberto para conferir um a um (o ML nem sempre marca como alterado quando só o envio muda). */
  reconferir?: string[];
};

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

/** NF-e que o vendedor informou ao marketplace (emitida em outro sistema). */
export type NotaDoPedido = { chave: string; status: string; emitidaEm: Date | null; xml: string };

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
  /** Notas fiscais informadas no marketplace para o pedido (`dados` é o pedido como a API devolveu). */
  notasDoPedido?(conta: ContaComToken, dados: unknown): Promise<NotaDoPedido[]>;
  /** Anúncios existentes na conta, para vincular aos produtos do cadastro. */
  anuncios(conta: ContaComToken): Promise<AnuncioExterno[]>;
  /** Troca título e/ou descrição de um anúncio que já existe. Devolve avisos do que a plataforma não deixou mudar. */
  atualizar(conta: ContaComToken, idExterno: string, mudancas: { titulo?: string; descricao?: string }): Promise<string[]>;
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
