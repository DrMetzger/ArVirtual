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
  return Boolean(s["gemini.apiKey"] || process.env.GEMINI_API_KEY);
}

// Gemini 3.x pensa em nível "medium" por padrão e demora demais para tarefas simples do sistema;
// o 2.5 usa orçamento em tokens (no flash, 0 desliga).
function pensamento(model: string) {
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: 128 };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

// Padrão e reservas: modelos que respondem no plano gratuito. Se o modelo escolhido estiver
// sobrecarregado (503), sem cota (429) ou demorar demais, o próximo da lista responde.
export const MODELO_PADRAO = "gemini-3.6-flash";
// Em ordem: os que responderam com a chave gratuita no teste (25/10/2026). Os "-latest" apontam para a versão estável do Google.
const RESERVAS = [MODELO_PADRAO, "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"];
const TEMPO_LIMITE_MS = 20_000;
const ORCAMENTO_MS = 60_000; // tempo máximo somando todas as tentativas

class Indisponivel extends Error {}

async function chamar(model: string, apiKey: string, messages: ChatMessage[], opts: { system?: string; json?: boolean; temperature?: number }) {
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
          thinkingConfig: pensamento(model),
        },
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    },
  ).catch((e: Error) => {
    if (e.name === "TimeoutError") throw new Indisponivel(`${model} não respondeu em ${TEMPO_LIMITE_MS / 1000} s`);
    throw new Error(`Gemini: falha de conexão (${e.message}).`);
  });
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message: string };
  };
  if ([404, 429, 500, 503].includes(res.status)) throw new Indisponivel(`${model}: ${data.error?.message ?? res.statusText}`);
  if (!res.ok) throw new Error(`Gemini (${model}): ${data.error?.message ?? res.statusText}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Indisponivel(`${model} não retornou conteúdo`);
  return text;
}

/** Gera texto e informa qual modelo respondeu (o configurado ou uma reserva). */
export async function gerarComGeminiDetalhado(
  messages: ChatMessage[],
  opts: { system?: string; json?: boolean; temperature?: number } = {},
): Promise<{ texto: string; modelo: string }> {
  const s = await getSettings(["gemini.apiKey", "gemini.model"]);
  // A chave da tela tem prioridade; GEMINI_API_KEY vem do segredo APP_GEMINI do GitHub.
  const apiKey = s["gemini.apiKey"] || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Cadastre a chave da API Gemini em Configurações › Integrações.");
  const modelos = [...new Set([s["gemini.model"] || MODELO_PADRAO, ...RESERVAS])];
  const falhas: string[] = [];
  const limite = Date.now() + ORCAMENTO_MS;
  // Duas voltas pela lista: picos de "high demand" do plano gratuito costumam passar em poucos segundos.
  for (let volta = 0; volta < 2; volta++) {
    if (volta) await new Promise((r) => setTimeout(r, 3000));
    for (const modelo of modelos) {
      if (Date.now() > limite) break;
      try {
        return { texto: await chamar(modelo, apiKey, messages, opts), modelo };
      } catch (e) {
        if (!(e instanceof Indisponivel)) throw e;
        falhas.push(e.message);
      }
    }
  }
  console.warn(`[gemini] todos os modelos indisponíveis: ${falhas.join(" · ")}`);
  throw new Error(
    "O Google Gemini está sobrecarregado agora (plano gratuito) e nenhum dos modelos respondeu. Tente de novo em 1 ou 2 minutos.",
  );
}

export async function gerarComGemini(
  messages: ChatMessage[],
  opts: { system?: string; json?: boolean; temperature?: number } = {},
): Promise<string> {
  return (await gerarComGeminiDetalhado(messages, opts)).texto;
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
