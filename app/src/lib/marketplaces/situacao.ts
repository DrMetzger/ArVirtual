import type { Marketplace } from "@/db/schema";

// Cada marketplace tem seus próprios status; aqui viram uma situação única para filtrar e somar.
export const SITUACOES = {
  aguardando: { nome: "Aguardando pagamento", tom: "neutral" },
  pago: { nome: "A enviar", tom: "gold" },
  enviado: { nome: "Enviado", tom: "blue" },
  entregue: { nome: "Entregue", tom: "green" },
  cancelado: { nome: "Cancelado", tom: "red" },
} as const;
export type Situacao = keyof typeof SITUACOES;

const MAPA: Record<Marketplace, Record<string, Situacao>> = {
  mercadolivre: {
    confirmed: "aguardando",
    payment_required: "aguardando",
    payment_in_process: "aguardando",
    partially_paid: "aguardando",
    paid: "pago",
    partially_refunded: "pago",
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
    shipped: "enviado",
    delivered: "entregue",
    finished: "entregue",
    cancelled: "cancelado",
    canceled: "cancelado",
  },
};

export function situacaoPedido(marketplace: Marketplace, status: string): Situacao {
  return MAPA[marketplace]?.[status] ?? MAPA[marketplace]?.[status.toLowerCase()] ?? "aguardando";
}

/** Status originais de cada situação (para filtrar no banco). */
export function statusDaSituacao(situacao: Situacao): { marketplace: Marketplace; status: string }[] {
  return (Object.entries(MAPA) as [Marketplace, Record<string, Situacao>][]).flatMap(([marketplace, m]) =>
    Object.entries(m)
      .filter(([, s]) => s === situacao)
      .map(([status]) => ({ marketplace, status })),
  );
}

/** Link do pedido no painel do vendedor. */
export function linkPedido(marketplace: Marketplace, idExterno: string) {
  if (marketplace === "mercadolivre") return `https://www.mercadolivre.com.br/vendas/${idExterno}/detalhe`;
  if (marketplace === "shopee") return `https://seller.shopee.com.br/portal/sale/order?search=${idExterno}`;
  return "https://seller.magalu.com/pedidos";
}
