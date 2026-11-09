import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { adapter, contaComToken } from "@/lib/marketplaces";

const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 28.35; // 1 cm

/** Cada etiqueta do PDF do marketplace numa folha A4, no tamanho real (no canto, para recortar); a grande é reduzida para caber. */
async function emA4(original: Buffer) {
  const origem = await PDFDocument.load(original);
  const saida = await PDFDocument.create();
  const paginas = await saida.embedPdf(original, origem.getPageIndices());
  for (const p of paginas) {
    const escala = Math.min(1, (A4.w - 2 * MARGEM) / p.width, (A4.h - 2 * MARGEM) / p.height);
    const folha = saida.addPage([A4.w, A4.h]);
    folha.drawPage(p, { x: MARGEM, y: A4.h - MARGEM - p.height * escala, width: p.width * escala, height: p.height * escala });
  }
  return Buffer.from(await saida.save());
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id) || 0;
  const voltar = (erro: string) => Response.redirect(new URL(`/pedidos/${id}?erro=${encodeURIComponent(erro)}`, process.env.APP_URL || req.url), 303);
  const pedido = await db.query.pedidosMarketplace.findFirst({ where: eq(pedidosMarketplace.id, id) });
  if (!pedido?.contaId) return voltar("Pedido sem conta de marketplace.");
  const a = adapter(pedido.marketplace);
  if (!a.etiqueta) return voltar(`Etiqueta pela API ainda não disponível para ${a.nome}.`);
  try {
    const conta = await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, pedido.contaId) });
    if (!conta) throw new Error("A conta do marketplace deste pedido foi desconectada.");
    const original = await a.etiqueta(await contaComToken(conta), pedido.dados);
    const original_ = new URL(req.url).searchParams.get("formato") === "original";
    const pdf = original_ ? original : await emA4(original);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiqueta-${pedido.idExterno}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return voltar((e as Error).message);
  }
}
