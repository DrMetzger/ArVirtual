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
