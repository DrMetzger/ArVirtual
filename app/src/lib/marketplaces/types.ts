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
};

export type ResultadoAnuncio = { idExterno: string; link: string };

export type PedidoExterno = {
  idExterno: string;
  status: string;
  total: number;
  comprador: string;
  data: Date;
  dados: unknown;
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
  pedidos(conta: ContaComToken, desde: Date): Promise<PedidoExterno[]>;
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
    const msg = [b?.message, b?.error_description, b?.error, causas].filter(Boolean).join(" · ");
    throw new MarketplaceError(`${origem} (${res.status}): ${msg || text.slice(0, 300)}`);
  }
  return body as T;
}
