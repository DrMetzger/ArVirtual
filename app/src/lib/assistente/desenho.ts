import "server-only";
import sharp from "sharp";
import { gerarComGeminiDetalhado } from "@/lib/gemini";

const TAMANHOS: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "16:9": [1280, 720],
  "9:16": [720, 1280],
};

/** Tira do SVG o que poderia executar ou buscar algo de fora (só desenho fica). */
function limparSvg(svg: string) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
}

/**
 * Sem cota de imagem na API gratuita: a IA de texto (grátis) desenha em SVG (vetor). Serve bem para molde,
 * ícone, logo simples e ilustração; não é foto. Devolve o SVG e um PNG renderizado dele.
 */
export async function desenharSvg(pedido: string, proporcao?: string) {
  const [w, h] = TAMANHOS[proporcao ?? "1:1"] ?? TAMANHOS["1:1"]!;
  const { texto, modelo } = await gerarComGeminiDetalhado(
    [
      {
        role: "user",
        text: `Desenhe em SVG: ${pedido}\n\nRegras: responda SOMENTE com o código <svg ...>...</svg>, sem explicações nem markdown. Use viewBox="0 0 ${w} ${h}", fundo branco, formas limpas e proporções reais do objeto. Se for molde/gabarito, faça só o contorno em linha preta (stroke 3) sobre branco, com as partes principais. Texto pedido deve aparecer escrito exatamente como foi pedido. Nada de imagens externas.`,
      },
    ],
    { system: "Você é um ilustrador vetorial. Só responde com SVG válido e completo.", temperature: 0.4 },
  );
  const bruto = texto.match(/<svg[\s\S]*<\/svg>/i)?.[0];
  if (!bruto) throw new Error("A IA não conseguiu desenhar isso em vetor. Tente descrever de outro jeito (ex.: contorno simples, vista de cima).");
  const svg = limparSvg(bruto);
  const png = await sharp(Buffer.from(svg), { density: 144 })
    .resize(w, h, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer()
    .catch(() => {
      throw new Error("O desenho veio com erro e não deu para gerar a imagem. Clique em Tentar de novo.");
    });
  return { svg, png, modelo };
}
