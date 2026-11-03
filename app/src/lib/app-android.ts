import "server-only";
import { readFile } from "node:fs/promises";
import { UPLOAD_DIR } from "@/lib/uploads";

/** APK do app Android: o build no GitHub Actions grava o arquivo e um JSON com a versão no volume de uploads. */
export const APK = `${UPLOAD_DIR}/app/arvirtual.apk`;
const INFO = `${UPLOAD_DIR}/app/arvirtual.json`;

export type InfoApp = { versao: string; data: string; tamanho: number };

export async function infoApp(): Promise<InfoApp | null> {
  try {
    const i = JSON.parse(await readFile(INFO, "utf8")) as Partial<InfoApp>;
    return i.versao ? { versao: i.versao, data: i.data ?? "", tamanho: Number(i.tamanho) || 0 } : null;
  } catch {
    return null;
  }
}

/** O próprio app avisa no user-agent ("ArVirtualApp/1.0.x"): lá dentro não faz sentido oferecer o download. */
export const dentroDoApp = (userAgent: string | null) => /ArVirtualApp\//.test(userAgent ?? "");

/** Versão do app que está acessando ("1.0.12"), pelo user-agent; null fora do app. */
export function versaoDoApp(userAgent: string | null) {
  return (userAgent ?? "").match(/ArVirtualApp\/([\d.]+)/)?.[1] ?? null;
}

/** -1 se a < b, 0 se iguais, 1 se a > b (compara número a número: 1.0.10 > 1.0.9). */
export function compararVersao(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// A versão publicada muda só no deploy do APK: lê o JSON no máximo a cada minuto.
let cacheInfo: { ate: number; info: InfoApp | null } = { ate: 0, info: null };
async function infoAppCache() {
  if (cacheInfo.ate < Date.now()) cacheInfo = { ate: Date.now() + 60_000, info: await infoApp() };
  return cacheInfo.info;
}

/**
 * App desatualizado: abre pelo app numa versão menor que a última publicada. Devolve as duas versões (para a tela
 * pedir a atualização) ou null se está em dia, fora do app ou sem APK publicado.
 */
export async function appDesatualizado(userAgent: string | null) {
  const usada = versaoDoApp(userAgent);
  if (!usada) return null;
  const ultima = (await infoAppCache())?.versao;
  return ultima && compararVersao(usada, ultima) < 0 ? { usada, ultima } : null;
}
