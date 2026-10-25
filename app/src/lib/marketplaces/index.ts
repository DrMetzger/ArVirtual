import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace, type ContaMarketplace, type Marketplace } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { magalu } from "./magalu";
import { mercadoLivre } from "./mercadolivre";
import { shopee } from "./shopee";
import type { ContaComToken, MarketplaceAdapter } from "./types";

export const ADAPTERS: Record<Marketplace, MarketplaceAdapter> = {
  mercadolivre: mercadoLivre,
  shopee,
  magalu,
};

export function adapter(id: string): MarketplaceAdapter {
  const a = ADAPTERS[id as Marketplace];
  if (!a) throw new Error(`Marketplace desconhecido: ${id}`);
  return a;
}

export function callbackUrl(origin: string, id: Marketplace) {
  return `${process.env.APP_URL ?? origin}/api/marketplaces/${id}/callback`;
}

/** Devolve um access token válido, renovando e salvando quando estiver perto de expirar. */
export async function contaComToken(conta: ContaMarketplace): Promise<ContaComToken> {
  const base: ContaComToken = {
    idExterno: conta.idExterno,
    accessToken: decrypt(conta.accessTokenEnc),
    dados: (conta.dados as Record<string, unknown>) ?? null,
  };
  const expira = conta.expiraEm?.getTime() ?? Infinity;
  if (expira - Date.now() > 5 * 60_000 || !conta.refreshTokenEnc) return base;

  const t = await adapter(conta.marketplace).renovar(decrypt(conta.refreshTokenEnc), base);
  await db
    .update(contasMarketplace)
    .set({
      accessTokenEnc: encrypt(t.accessToken),
      refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : conta.refreshTokenEnc,
      expiraEm: t.expiraEm,
    })
    .where(eq(contasMarketplace.id, conta.id));
  return { ...base, accessToken: t.accessToken };
}

type ResultadoSync = { conta: string; marketplace: Marketplace; pedidos: number; erro?: string }[];
let emAndamento: Promise<ResultadoSync> | null = null;

/** Busca pedidos dos últimos `dias` em todas as contas conectadas e grava/atualiza no banco.
 *  Uma sincronização por vez: a automática e o botão compartilham a mesma execução. */
export function sincronizarPedidos(dias = 30, porAtualizacao = false) {
  emAndamento ??= sincronizar(dias, porAtualizacao).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function sincronizar(dias: number, porAtualizacao: boolean): Promise<ResultadoSync> {
  const contas = await db.select().from(contasMarketplace);
  const desde = new Date(Date.now() - dias * 86400_000);
  const resultado: ResultadoSync = [];

  for (const conta of contas) {
    try {
      const pedidos = await adapter(conta.marketplace).pedidos(await contaComToken(conta), desde, porAtualizacao);
      // Conta com nome genérico ganha o nome da loja que vem nos pedidos.
      const loja = pedidos.find((p) => p.loja)?.loja;
      if (loja && /^(Loja|Seller) Magalu\b/.test(conta.nome)) {
        await db.update(contasMarketplace).set({ nome: loja }).where(eq(contasMarketplace.id, conta.id));
      }
      for (const p of pedidos) {
        const valores = {
          status: p.status,
          total: p.total,
          frete: p.frete,
          comprador: p.comprador,
          data: p.data,
          itens: p.itens,
          entrega: p.entrega,
          dados: p.dados as object,
        };
        await db
          .insert(pedidosMarketplace)
          .values({ contaId: conta.id, marketplace: conta.marketplace, idExterno: p.idExterno, ...valores })
          .onConflictDoUpdate({ target: [pedidosMarketplace.marketplace, pedidosMarketplace.idExterno], set: { ...valores, atualizadoEm: new Date() } });
      }
      await db.update(contasMarketplace).set({ ultimaSincronizacao: new Date() }).where(eq(contasMarketplace.id, conta.id));
      resultado.push({ conta: conta.nome, marketplace: conta.marketplace, pedidos: pedidos.length });
    } catch (e) {
      resultado.push({ conta: conta.nome, marketplace: conta.marketplace, pedidos: 0, erro: (e as Error).message });
    }
  }
  return resultado;
}

export const MARKETPLACE_INFO: Record<Marketplace, { nome: string; cor: string; portal: string }> = {
  mercadolivre: { nome: "Mercado Livre", cor: "var(--mp-mercadolivre)", portal: "https://developers.mercadolivre.com.br/devcenter" },
  shopee: { nome: "Shopee", cor: "var(--mp-shopee)", portal: "https://open.shopee.com/" },
  magalu: { nome: "Magalu", cor: "var(--mp-magalu)", portal: "https://developers.magalu.com/" },
};
