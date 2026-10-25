import type { Nota } from "@/db/schema";

/** Nota que ainda vale para o pedido; cancelada, rejeitada ou denegada libera emitir outra. */
export const notaVale = (status: Nota["status"] | null | undefined) => Boolean(status) && !["cancelada", "rejeitada", "denegada"].includes(status!);
