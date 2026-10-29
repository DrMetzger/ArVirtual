import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";

/** O app Android se identifica no user-agent: "ArVirtualApp/1.0.x aparelho/<id>". */
export function idDoAparelho(userAgent: string | null) {
  return userAgent?.match(/ArVirtualApp\/[\d.]+ aparelho\/([\w-]{8,64})/)?.[1] ?? null;
}

// Bloqueio consultado em toda página: guarda a resposta por alguns segundos (bloquear limpa na hora).
const cache = new Map<string, { bloqueado: boolean; ate: number }>();

export async function aparelhoBloqueado(id: string | null) {
  if (!id) return false;
  const c = cache.get(id);
  if (c && c.ate > Date.now()) return c.bloqueado;
  const a = await db.query.aparelhos.findFirst({ where: eq(aparelhos.id, id), columns: { bloqueado: true } });
  const bloqueado = Boolean(a?.bloqueado);
  cache.set(id, { bloqueado, ate: Date.now() + 15_000 });
  return bloqueado;
}

export const esquecerBloqueio = (id: string) => cache.delete(id);

export type InfoAparelho = {
  id: string;
  fabricante?: string;
  modelo?: string;
  android?: string;
  versaoApp?: string;
  bateria?: number | null;
  carregando?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  precisao?: number | null;
  localizadoEm?: number | null;
  notificacoes?: boolean;
};

const texto = (v: unknown, max = 80) => String(v ?? "").slice(0, max);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Grava/atualiza o aparelho com o que o app informou (só o que veio; localização só se houver). */
export async function registrarAparelho(info: InfoAparelho, usuario: { sub: string; nome: string } | null, ip: string) {
  if (!/^[\w-]{8,64}$/.test(info.id ?? "")) throw new Error("Aparelho inválido.");
  const lat = numero(info.latitude);
  const lng = numero(info.longitude);
  const valores = {
    ...(usuario ? { usuarioId: usuario.sub, usuarioNome: usuario.nome } : {}),
    ...(info.fabricante !== undefined ? { fabricante: texto(info.fabricante) } : {}),
    ...(info.modelo !== undefined ? { modelo: texto(info.modelo) } : {}),
    ...(info.android !== undefined ? { android: texto(info.android, 20) } : {}),
    ...(info.versaoApp !== undefined ? { versaoApp: texto(info.versaoApp, 20) } : {}),
    ...(numero(info.bateria) !== null ? { bateria: Math.max(0, Math.min(100, Math.round(info.bateria!))), carregando: Boolean(info.carregando) } : {}),
    ...(lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? {
          latitude: lat,
          longitude: lng,
          precisaoM: numero(info.precisao) !== null ? Math.round(info.precisao!) : null,
          localizadoEm: numero(info.localizadoEm) ? new Date(info.localizadoEm!) : new Date(),
        }
      : {}),
    ...(info.notificacoes !== undefined ? { notificacoes: Boolean(info.notificacoes) } : {}),
    ip: ip.slice(0, 60),
    ultimoAcesso: new Date(),
  };
  const [a] = await db
    .insert(aparelhos)
    .values({ id: info.id, ...valores })
    .onConflictDoUpdate({ target: aparelhos.id, set: valores })
    .returning({ bloqueado: aparelhos.bloqueado });
  return { bloqueado: Boolean(a?.bloqueado) };
}
