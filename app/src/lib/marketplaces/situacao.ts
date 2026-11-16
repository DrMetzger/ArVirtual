import type { CanalVenda } from "@/db/schema";

// Cada marketplace tem seus próprios status; aqui viram uma situação única para filtrar e somar.
export const SITUACOES = {
  aguardando: { nome: "Aguardando pagamento", tom: "neutral" },
  pago: { nome: "A enviar", tom: "gold" },
  enviado: { nome: "Enviado", tom: "blue" },
  entregue: { nome: "Entregue", tom: "green" },
  cancelado: { nome: "Cancelado", tom: "red" },
} as const;
export type Situacao = keyof typeof SITUACOES;

const MAPA: Record<CanalVenda, Record<string, Situacao>> = {
  // Loja própria: o status gravado já é a situação.
  loja: { aguardando: "aguardando", pago: "pago", enviado: "enviado", entregue: "entregue", cancelado: "cancelado" },
  mercadolivre: {
    confirmed: "aguardando",
    payment_required: "aguardando",
    payment_in_process: "aguardando",
    partially_paid: "aguardando",
    paid: "pago",
    partially_refunded: "pago",
    shipped: "enviado",
    delivered: "entregue",
    pending_cancel: "cancelado",
    cancelled: "cancelado",
    invalid: "cancelado",
  },
  shopee: {
    UNPAID: "aguardando",
    PENDING: "aguardando",
    READY_TO_SHIP: "pago",
    PROCESSED: "pago",
    RETRY_SHIP: "pago",
    SHIPPED: "enviado",
    TO_CONFIRM_RECEIVE: "enviado",
    COMPLETED: "entregue",
    IN_CANCEL: "cancelado",
    CANCELLED: "cancelado",
    TO_RETURN: "cancelado",
  },
  magalu: {
    new: "aguardando",
    created: "aguardando",
    pending: "aguardando",
    approved: "pago",
    invoiced: "pago",
    handling: "pago",
    frozen: "pago",
    processing: "pago",
    shipped: "enviado",
    delivered: "entregue",
    finished: "entregue",
    cancelled: "cancelado",
    canceled: "cancelado",
  },
};

export function situacaoPedido(marketplace: CanalVenda, status: string): Situacao {
  return MAPA[marketplace]?.[status] ?? MAPA[marketplace]?.[status.toLowerCase()] ?? "aguardando";
}

/** Status originais de cada situação (para filtrar no banco). */
export function statusDaSituacao(situacao: Situacao): { marketplace: CanalVenda; status: string }[] {
  return (Object.entries(MAPA) as [CanalVenda, Record<string, Situacao>][]).flatMap(([marketplace, m]) =>
    Object.entries(m)
      .filter(([, s]) => s === situacao)
      .map(([status]) => ({ marketplace, status })),
  );
}

/** Número do pedido como o marketplace mostra (a Magalu exibe "LU-" na frente). */
export function numeroPedido(marketplace: CanalVenda, idExterno: string) {
  return marketplace === "magalu" && /^\d+$/.test(idExterno) ? `LU-${idExterno}` : idExterno;
}

/** Link do pedido no painel do vendedor. */
export function linkPedido(marketplace: CanalVenda, idExterno: string, pack?: string | null) {
  if (marketplace === "loja") return null;
  // Venda com carrinho (pack): o painel do Mercado Livre usa o número do pack.
  if (marketplace === "mercadolivre") return `https://www.mercadolivre.com.br/vendas/${pack || idExterno}/detalhe`;
  if (marketplace === "shopee") return `https://seller.shopee.com.br/portal/sale/order?search=${idExterno}`;
  return "https://seller.magalu.com/pedidos";
}

export const MAGALU_SEM_NOTA = "Nenhuma nota encontrada ainda. Se a nota foi enviada no Portal do Seller, clique em Buscar nota.";

/** Número que o painel do Mercado Livre mostra (pack, quando a venda tem carrinho). */
export function packMercadoLivre(dados: unknown) {
  const pack = (dados as { pedido?: { pack_id?: number | null } } | null)?.pedido?.pack_id;
  return pack ? String(pack) : null;
}
