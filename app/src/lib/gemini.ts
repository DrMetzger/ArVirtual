import "server-only";
import { getSettings } from "./settings";

export type ChatMessage = { role: "user" | "model"; text: string };

const SYSTEM = `Você é o assistente da ArVirtual, empresa de pesquisa e desenvolvimento de São José do Rio Preto (SP)
que vende peças impressas em 3D (Bambu Lab A1 mini) em Mercado Livre, Shopee e Magalu e emite NF-e.
Ajude com: anúncios e descrições de produtos, precificação, NCM/CFOP/CST/CSOSN, rotinas fiscais, atendimento a clientes,
automação com ESP32 e integrações com ERP (TOTVS Protheus/ADVPL). Responda em português do Brasil, de forma objetiva.
Em temas fiscais, deixe claro quando algo precisa ser confirmado com o contador.`;

export async function geminiConfigurado() {
  const s = await getSettings(["gemini.apiKey"]);
  return Boolean(s["gemini.apiKey"]);
}

export async function gerarComGemini(
  messages: ChatMessage[],
  opts: { system?: string; json?: boolean; temperature?: number } = {},
): Promise<string> {
  const s = await getSettings(["gemini.apiKey", "gemini.model"]);
  const apiKey = s["gemini.apiKey"];
  if (!apiKey) throw new Error("Cadastre a chave da API Gemini em Configurações › Integrações.");
  const model = s["gemini.model"] || "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system ?? SYSTEM }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`Gemini: ${data.error?.message ?? res.statusText}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini não retornou conteúdo.");
  return text;
}

export type SugestaoAnuncio = { titulo: string; descricao: string; palavrasChave: string[] };

export async function sugerirAnuncio(produto: {
  nome: string;
  descricao: string;
  material: string;
  cor: string;
  pesoG: number;
  dimensoes: string;
}): Promise<SugestaoAnuncio> {
  const prompt = `Crie um anúncio para marketplace (Mercado Livre, Shopee e Magalu) do produto abaixo.
Responda APENAS em JSON: {"titulo": string até 60 caracteres, "descricao": string em texto puro com parágrafos e tópicos, "palavrasChave": string[] com até 8 termos}.
Não invente medidas ou características que não estejam nos dados.

Produto: ${produto.nome}
Descrição atual: ${produto.descricao || "(vazia)"}
Material: ${produto.material || "não informado"} | Cor: ${produto.cor || "não informada"}
Peso: ${produto.pesoG} g | Dimensões: ${produto.dimensoes}
Fabricado em impressão 3D.`;
  const raw = await gerarComGemini([{ role: "user", text: prompt }], { json: true, temperature: 0.6 });
  const parsed = JSON.parse(raw) as Partial<SugestaoAnuncio>;
  return {
    titulo: String(parsed.titulo ?? "").slice(0, 60),
    descricao: String(parsed.descricao ?? ""),
    palavrasChave: Array.isArray(parsed.palavrasChave) ? parsed.palavrasChave.map(String) : [],
  };
}
