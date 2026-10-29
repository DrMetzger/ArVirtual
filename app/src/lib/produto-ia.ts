import "server-only";
import type { SugestaoNcm } from "@/lib/fiscal/ncm";
import { gerarComGemini, type Parte } from "@/lib/gemini";

export type CadastroIA = { titulo: string; descricao: string; ncms: SugestaoNcm[] };

/**
 * Cadastro de produto pela IA: o Gemini olha as fotos e o texto do vendedor e devolve, numa chamada só,
 * título de anúncio, descrição e os NCMs mais prováveis.
 */
export async function cadastroPelaIA(entrada: {
  texto: string;
  fotos: { mimeType: string; data: string }[];
  material: string;
  cor: string;
  pesoG: number;
  medidas: { altura: number; largura: number; profundidade: number };
  quantidade: number;
}): Promise<CadastroIA> {
  const cm = (n: number) => `${String(n).replace(".", ",")} cm`;
  const m = entrada.medidas;
  const medidas = [m.altura && `altura ${cm(m.altura)}`, m.largura && `largura ${cm(m.largura)}`, m.profundidade && `profundidade ${cm(m.profundidade)}`].filter(Boolean).join(", ");
  const prompt = `Você é especialista em anúncios de marketplace (Mercado Livre, Shopee e Magalu) e em classificação fiscal brasileira (NCM/TIPI).
Analise as fotos (${entrada.fotos.length}) e o texto do vendedor e crie o cadastro do produto. A peça é fabricada por impressão 3D.

O que o vendedor disse: ${entrada.texto}
Medidas do objeto: ${medidas || "não informadas"}
Quantidade por pacote: ${entrada.quantidade} ${entrada.quantidade > 1 ? "peças" : "peça"}
Material: ${entrada.material || "não informado"} (impressão 3D) | Cor: ${entrada.cor || "veja nas fotos"}${entrada.pesoG ? ` | Peso com embalagem: ${entrada.pesoG} g` : ""}

Regras:
- "titulo": até 60 caracteres, com o que é o produto e as palavras que o comprador pesquisa (tipo, uso, estilo, cor). Se o pacote tiver mais de uma peça, diga no título (ex.: "Kit 3"). Sem emojis, sem CAIXA ALTA inteira, sem "frete grátis" ou "promoção".
- "descricao": CURTA e que VENDE: no máximo 700 caracteres. Texto puro em português (sem HTML, markdown, emojis ou asteriscos).
  Formato: 1 ou 2 frases de abertura que despertem desejo (o benefício, onde usar, o efeito que causa); uma linha "Detalhes:" seguida de 3 a 5 tópicos curtos começando com "- " (medidas exatas em altura x largura x profundidade, quantidade de peças no pacote, material, cor e um diferencial); e 1 frase final chamando para a compra.
  Use só o que se vê nas fotos ou o vendedor informou; não invente medidas, quantidades ou certificações. Sem repetir o título nem encher linguiça.
- "ncms": até 3 NCMs de 8 dígitos do mais provável ao menos provável, com a descrição oficial e uma justificativa curta (considere o material plástico da impressão 3D e o uso do produto).

Responda somente com JSON: {"titulo": string, "descricao": string, "ncms": [{"ncm": "8 dígitos", "descricao": string, "justificativa": string}]}`;

  const partes: Parte[] = entrada.fotos.map((f) => ({ inlineData: f }));
  const bruto = JSON.parse(await gerarComGemini([{ role: "user", text: prompt, partes }], { json: true, temperature: 0.5 })) as Record<string, unknown>;
  const obj = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown>;
  const ncms = (Array.isArray(obj?.ncms) ? obj.ncms : []) as Record<string, unknown>[];
  return {
    titulo: String(obj?.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    descricao: String(obj?.descricao ?? "")
      .replace(/\*\*?|__|#+ /g, "")
      .trim()
      .slice(0, 1500),
    ncms: ncms
      .map((x) => ({ ncm: String(x.ncm ?? "").replace(/\D/g, ""), descricao: String(x.descricao ?? ""), justificativa: String(x.justificativa ?? "") }))
      .filter((x) => /^\d{8}$/.test(x.ncm))
      .slice(0, 3),
  };
}
