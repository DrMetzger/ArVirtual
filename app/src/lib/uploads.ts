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

/** Vídeos de produto: MP4 até 30 MB (limite da Shopee; ela também pede de 10 a 60 segundos). */
export const MAX_VIDEO = 30 * 1024 * 1024;

export async function salvarVideo(file: File, origin: string): Promise<string> {
  if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
    throw new Error(`${file.name}: envie o vídeo em MP4 (formato aceito pela Shopee).`);
  }
  if (file.size > MAX_VIDEO) throw new Error(`${file.name} passa de 30 MB (limite da Shopee).`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nome = `video-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.mp4`;
  await writeFile(`${UPLOAD_DIR}/${nome}`, Buffer.from(await file.arrayBuffer()));
  return `${process.env.APP_URL ?? origin}/uploads/${nome}`;
}

/** Arquivos de impressão (privados: só com login). A impressora A1 mini abre 3MF, STL, OBJ, STEP e G-code. */
export const PASTA_IMPRESSAO = `${UPLOAD_DIR}/impressao`;
export const EXTENSOES_IMPRESSAO = ["3mf", "stl", "obj", "step", "stp", "gcode", "amf", "ply", "zip"];
export const MAX_ARQUIVO_IMPRESSAO = 150 * 1024 * 1024;

/** Vídeos do módulo de afiliados (privados: só com login). */
export const PASTA_AFILIADOS = `${UPLOAD_DIR}/afiliados`;
export const MAX_VIDEO_AFILIADO = 300 * 1024 * 1024;
