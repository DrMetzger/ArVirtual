import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { UPLOAD_DIR } from "@/lib/uploads";

// Foto de produto em JPEG (o Magalu só aceita image/jpeg). Pública como /uploads: os marketplaces baixam daqui.
export async function GET(_: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(nome)) return new Response("Não encontrado", { status: 404 });
  const original = await readFile(`${UPLOAD_DIR}/${nome}`).catch(() => null);
  if (!original) return new Response("Não encontrado", { status: 404 });
  const jpeg = nome.endsWith(".jpg") ? original : await sharp(original).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "Content-Length": String(jpeg.length) },
  });
}
