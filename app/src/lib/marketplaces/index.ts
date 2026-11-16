import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace, type ContaMarketplace, type Marketplace } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { atualizarEstoqueDoPedido } from "@/lib/estoque";
import { atualizarFinanceiroDoPedido } from "@/lib/financeiro";
import { buscarNotasPendentes, importarNotasDoPedido, precisaBuscarNotas } from "./notas-externas";
import { situacaoPedido } from "./situacao";
import { magalu } from "./magalu";
import { mercadoLivre } from "./mercadolivre";
import { shopee } from "./shopee";
import { tiktok } from "./tiktok";
import type { ContaComToken, EntregaPedido, MarketplaceAdapter } from "./types";

export const ADAPTERS: Record<Marketplace, MarketplaceAdapter> = {
  mercadolivre: mercadoLivre,
  shopee,
  magalu,
  tiktok,
};

export function adapter(id: string): MarketplaceAdapter {
  const a = ADAPTERS[id as Marketplace];
  if (!a) throw new Error(`Marketplace desconhecido: ${id}`);
  return a;
}

/** Busca as notas dos pedidos faturados que ainda não têm nota salva (botão em Pedidos). */
export const buscarNotasDosPedidos = () => buscarNotasPendentes(contaComToken, adapter);

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

export type OpcoesSync =
  /** Automática (a cada 15 min, ao subir e nos avisos do marketplace): só o que mudou desde a última rodada de cada conta. */
  | { tipo: "novidades"; marketplace?: Marketplace; /** Busca rápida (2 em 2 min): sem reconferir os pagos/enviados antigos. */ rapido?: boolean }
  /** Manual: pedidos comprados no período, nas contas escolhidas (todas, se vazio). */
  | { tipo: "periodo"; desde: Date; ate?: Date; contas?: number[] };

let emAndamento: Promise<ResultadoSync> | null = null;

/**
 * Busca os pedidos nos marketplaces e grava/atualiza no banco. Uma sincronização por vez:
 * a automática pega carona na que já está rodando; a manual espera a atual terminar e roda a dela.
 */
export async function sincronizarPedidos(opcoes: OpcoesSync = { tipo: "novidades" }): Promise<ResultadoSync> {
  if (opcoes.tipo === "novidades" && emAndamento) return emAndamento;
  while (emAndamento) await emAndamento.catch(() => undefined);
  emAndamento = sincronizar(opcoes)
    .then(async (r) => {
      // Pedido novo: push no celular na hora (importação dinâmica: push.ts usa este módulo).
      await import("@/lib/push").then((m) => m.avisarPedidosNovos()).catch((e: Error) => console.warn(`[push] ${e.message}`));
      return r;
    })
    .finally(() => {
      emAndamento = null;
    });
  return emAndamento;
}

async function sincronizar(opcoes: OpcoesSync): Promise<ResultadoSync> {
  const todas = await db.select().from(contasMarketplace);
  const contas = todas.filter((c) =>
    opcoes.tipo === "novidades" ? !opcoes.marketplace || c.marketplace === opcoes.marketplace : !opcoes.contas?.length || opcoes.contas.includes(c.id),
  );
  const resultado: ResultadoSync = [];

  for (const conta of contas) {
    try {
      const a = adapter(conta.marketplace);
      const token = await contaComToken(conta);
      const novidades = opcoes.tipo === "novidades";
      // Novidades: desde a última rodada (com 30 min de folga); conta nunca sincronizada, últimos 2 dias.
      const desde = novidades
        ? new Date((conta.ultimaSincronizacao?.getTime() ?? Date.now() - 2 * 86400_000) - 30 * 60_000)
        : opcoes.desde;
      const inicio = new Date();
      // Pedidos pagos/enviados dos últimos 120 dias: reconferidos a cada rodada até chegarem a entregue.
      const reconferir = novidades && !(opcoes.tipo === "novidades" && opcoes.rapido)
        ? (
            await db
              .select({ idExterno: pedidosMarketplace.idExterno, status: pedidosMarketplace.status })
              .from(pedidosMarketplace)
              .where(and(eq(pedidosMarketplace.contaId, conta.id), gte(pedidosMarketplace.data, new Date(Date.now() - 120 * 86400_000))))
          )
            .filter((p) => ["pago", "enviado"].includes(situacaoPedido(conta.marketplace, p.status)))
            .map((p) => p.idExterno)
        : [];
      const pedidos = await a.pedidos(token, novidades ? { desde, porAtualizacao: true, reconferir } : { desde, ate: opcoes.ate });
      const historico = (data: Date) => data.getTime() < conta.criadoEm.getTime() - 86400_000;
      // Conta com nome genérico ganha o nome da loja que vem nos pedidos.
      const loja = pedidos.find((p) => p.loja)?.loja;
      if (loja && /^(Loja|Seller) Magalu\b/.test(conta.nome)) {
        await db.update(contasMarketplace).set({ nome: loja }).where(eq(contasMarketplace.id, conta.id));
      }
      // O marketplace mascara os dados do comprador depois que o pedido termina ou é cancelado (ex.: Shopee "P******R"):
      // o que já foi salvo sem máscara não é trocado pela versão mascarada.
      const salvos = pedidos.length
        ? await db
            .select({ idExterno: pedidosMarketplace.idExterno, comprador: pedidosMarketplace.comprador, entrega: pedidosMarketplace.entrega })
            .from(pedidosMarketplace)
            .where(and(eq(pedidosMarketplace.marketplace, conta.marketplace), inArray(pedidosMarketplace.idExterno, pedidos.map((p) => p.idExterno))))
        : [];
      for (const p of pedidos) {
        const antes = salvos.find((x) => x.idExterno === p.idExterno);
        const valores = {
          status: p.status,
          total: p.total,
          frete: p.frete,
          comprador: semMascara(p.comprador, antes?.comprador),
          data: p.data,
          itens: p.itens,
          entrega: mesclarEntrega(p.entrega, antes?.entrega ?? null),
          dados: p.dados as object,
        };
        const [salvo] = await db
          .insert(pedidosMarketplace)
          // Pedido de antes de conectar a conta é histórico: já saiu do estoque e já foi recebido.
          .values({
            contaId: conta.id,
            marketplace: conta.marketplace,
            idExterno: p.idExterno,
            ...valores,
            // Só conta como já baixado o que foi venda (cancelado histórico nunca saiu do estoque).
            estoqueBaixado: historico(p.data) && ["pago", "enviado", "entregue"].includes(situacaoPedido(conta.marketplace, p.status)),
            financeiroGerado: historico(p.data),
          })
          .onConflictDoUpdate({ target: [pedidosMarketplace.marketplace, pedidosMarketplace.idExterno], set: { ...valores, atualizadoEm: new Date() } })
          .returning();
        // Pago sai do estoque; cancelado depois de baixado volta.
        if (salvo) {
          await atualizarEstoqueDoPedido(salvo).catch((e: Error) => console.warn(`[estoque] pedido ${p.idExterno}: ${e.message}`));
          await atualizarFinanceiroDoPedido(salvo).catch((e: Error) => console.warn(`[financeiro] pedido ${p.idExterno}: ${e.message}`));
          // NF-e emitida fora e informada ao marketplace (Magalu devolve chave e XML).
          if (a.notasDoPedido && (await precisaBuscarNotas(salvo))) {
            await importarNotasDoPedido(a, token, salvo).catch((e: Error) => console.warn(`[notas] pedido ${p.idExterno}: ${e.message}`));
          }
        }
      }
      // Só a rodada de novidades marca o ponto de partida da próxima (a manual cobre só um período).
      if (novidades) await db.update(contasMarketplace).set({ ultimaSincronizacao: inicio }).where(eq(contasMarketplace.id, conta.id));
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

const mascarado = (v: string | undefined | null) => Boolean(v && v.includes("*"));

/** Valor novo, a não ser que venha mascarado (ou vazio) e o anterior não. */
function semMascara(novo: string, antigo: string | undefined | null) {
  return (!novo || mascarado(novo)) && antigo && !mascarado(antigo) ? antigo : novo;
}

/** Entrega nova campo a campo, mantendo os campos que já estavam sem máscara; documento mascarado não vale. */
function mesclarEntrega(nova: EntregaPedido | null, antiga: EntregaPedido | null): EntregaPedido | null {
  if (!nova) return antiga;
  const out = { ...nova } as Record<string, string | undefined>;
  const velha = (antiga ?? {}) as Record<string, string | undefined>;
  for (const k of Object.keys(out)) if (typeof out[k] === "string") out[k] = semMascara(out[k], velha[k]);
  if (mascarado(out.documento)) out.documento = undefined;
  return out as EntregaPedido;
}
