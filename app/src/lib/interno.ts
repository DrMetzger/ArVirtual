import { createHmac, timingSafeEqual } from "node:crypto";

// Chave das rotas internas (/api/interno/*), chamadas pelo próprio servidor. Derivada do AUTH_SECRET.
export function chaveInterna() {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update("rotas-internas").digest("hex");
}

export function chamadaInterna(req: Request) {
  const recebida = Buffer.from(req.headers.get("x-chave-interna") ?? "");
  const esperada = Buffer.from(chaveInterna());
  return Boolean(process.env.AUTH_SECRET) && recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}
