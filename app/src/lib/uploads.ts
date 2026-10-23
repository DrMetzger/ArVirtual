import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

// Caminho absoluto; no Docker é o volume /app/uploads.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGEM = 5 * 1024 * 1024;

/** Salva a imagem e devolve a URL pública absoluta (marketplaces baixam a imagem por ela). */
export async function salvarImagem(file: File, origin: string): Promise<string> {
  const ext = TIPOS[file.type];
  if (!ext) throw new Error(`Formato não suportado: ${file.name} (use JPG, PNG ou WEBP)`);
  if (file.size > MAX_IMAGEM) throw new Error(`${file.name} passa de 5 MB`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nome = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(`${UPLOAD_DIR}/${nome}`, Buffer.from(await file.arrayBuffer()));
  return `${process.env.APP_URL ?? origin}/uploads/${nome}`;
}
