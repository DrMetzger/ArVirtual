import { requireUser } from "@/lib/auth";
import { cadastroPelaIA } from "@/lib/produto-ia";

// Fotos chegam já reduzidas pelo navegador (JPEG ~1024 px); limite para não estourar a requisição ao Gemini.
const MAX_FOTOS = 6;
const MAX_BYTES_FOTO = 2_000_000;

const medida = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : 0;
};

export async function POST(req: Request) {
  await requireUser();
  const corpo = (await req.json().catch(() => null)) as {
    texto?: string;
    fotos?: string[];
    material?: string;
    cor?: string;
    pesoG?: number;
    altura?: string;
    largura?: string;
    profundidade?: string;
    quantidade?: number;
  } | null;
  const texto = String(corpo?.texto ?? "").trim().slice(0, 2000);
  if (texto.length < 3) return Response.json({ erro: "Conte em poucas palavras o que você está vendendo." }, { status: 400 });
  const fotos = (corpo?.fotos ?? [])
    .slice(0, MAX_FOTOS)
    .map((f) => /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(f)))
    .flatMap((m) => (m && m[1] && m[2] && m[2].length * 0.75 <= MAX_BYTES_FOTO ? [{ mimeType: m[1], data: m[2] }] : []));
  try {
    const r = await cadastroPelaIA({
      texto,
      fotos,
      material: String(corpo?.material ?? "").slice(0, 60),
      cor: String(corpo?.cor ?? "").slice(0, 100),
      pesoG: Number(corpo?.pesoG) || 0,
      medidas: { altura: medida(corpo?.altura), largura: medida(corpo?.largura), profundidade: medida(corpo?.profundidade) },
      quantidade: Math.min(1000, Math.max(1, Math.floor(Number(corpo?.quantidade) || 1))),
    });
    if (!r.titulo && !r.descricao) return Response.json({ erro: "A IA não conseguiu montar o cadastro. Tente descrever melhor o produto." }, { status: 502 });
    return Response.json(r);
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 502 });
  }
}
