import "server-only";
import { getSettings } from "./settings";

/** Parte extra da mensagem: texto (conteúdo de arquivo) ou arquivo em base64 (imagem, PDF). */
export type Parte = { text: string } | { inlineData: { mimeType: string; data: string } };
export type ChatMessage = { role: "user" | "model"; text: string; partes?: Parte[] };
export type Fonte = { titulo: string; url: string };
type Opcoes = { system?: string; json?: boolean; temperature?: number; pesquisa?: boolean };

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
export const MODELO_IMAGEM_PADRAO = "gemini-3.1-flash-image";
const RESERVAS_IMAGEM = [MODELO_IMAGEM_PADRAO, "gemini-3.1-flash-lite-image", "gemini-nano-banana-2.1", "gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
const TEMPO_LIMITE_MS = 20_000;
const ORCAMENTO_MS = 60_000; // tempo máximo somando todas as tentativas
// GEMINI_API_URL só para testes locais (servidor falso).
const BASE = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models";

class Indisponivel extends Error {}

type Resposta = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message: string };
};

function corpo(model: string, messages: ChatMessage[], opts: Opcoes & { imagem?: { proporcao?: string } }) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system ?? SYSTEM }] },
    contents: messages.map((m) => ({ role: m.role, parts: [...(m.partes ?? []), ...(m.text ? [{ text: m.text }] : [])] })),
    ...(opts.pesquisa ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: opts.imagem
      ? { responseModalities: ["TEXT", "IMAGE"], ...(opts.imagem.proporcao ? { imageConfig: { aspectRatio: opts.imagem.proporcao } } : {}) }
      : {
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
          thinkingConfig: pensamento(model),
        },
  });
}

async function requisitar(model: string, apiKey: string, acao: string, body: string, signal: AbortSignal) {
  const res = await fetch(`${BASE}/${encodeURIComponent(model)}:${acao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body,
    signal,
  }).catch((e: Error) => {
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new Indisponivel(`${model} não respondeu em ${TEMPO_LIMITE_MS / 1000} s`);
    throw new Error(`Gemini: falha de conexão (${e.message}).`);
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Resposta;
    if ([404, 429, 500, 503].includes(res.status)) throw new Indisponivel(`${model}: ${res.status} ${data.error?.message ?? res.statusText}`);
    throw new Error(`Gemini (${model}): ${data.error?.message ?? res.statusText}`);
  }
  return res;
}

const textoDe = (data: Resposta) =>
  data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";

function fontesDe(data: Resposta, acc: Fonte[]) {
  for (const c of data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (c.web?.uri && !acc.some((f) => f.url === c.web!.uri)) acc.push({ titulo: c.web.title || c.web.uri, url: c.web.uri });
  }
}

async function chamar(model: string, apiKey: string, messages: ChatMessage[], opts: Opcoes) {
  const res = await requisitar(model, apiKey, "generateContent", corpo(model, messages, opts), AbortSignal.timeout(TEMPO_LIMITE_MS));
  const data = (await res.json().catch(() => ({}))) as Resposta;
  const text = textoDe(data);
  if (!text) throw new Indisponivel(`${model} não retornou conteúdo`);
  return text;
}

async function credenciais(chaveModelo: "gemini.model" | "gemini.modeloImagem", padrao: string, reservas: string[]) {
  const s = await getSettings(["gemini.apiKey", chaveModelo]);
  // A chave da tela tem prioridade; GEMINI_API_KEY vem do segredo APP_GEMINI do GitHub.
  const apiKey = s["gemini.apiKey"] || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Cadastre a chave da API Gemini em Configurações › Integrações.");
  return { apiKey, modelos: [...new Set([s[chaveModelo] || padrao, ...reservas])] };
}

/** Tenta cada modelo (duas voltas pela lista) até um responder. */
async function comReservas<T>(modelos: string[], tentar: (modelo: string) => Promise<T>): Promise<T> {
  const falhas: string[] = [];
  const limite = Date.now() + ORCAMENTO_MS;
  // Duas voltas pela lista: picos de "high demand" do plano gratuito costumam passar em poucos segundos.
  for (let volta = 0; volta < 2; volta++) {
    if (volta) await new Promise((r) => setTimeout(r, 3000));
    for (const modelo of modelos) {
      if (Date.now() > limite) break;
      try {
        return await tentar(modelo);
      } catch (e) {
        if (!(e instanceof Indisponivel)) throw e;
        falhas.push(e.message);
      }
    }
  }
  console.warn(`[gemini] todos os modelos indisponíveis: ${falhas.join(" · ")}`);
  throw new FalhaGemini(falhas);
}

class FalhaGemini extends Error {
  constructor(readonly falhas: string[]) {
    super("O Google Gemini está sobrecarregado agora (plano gratuito) e nenhum dos modelos respondeu. Tente de novo em 1 ou 2 minutos.");
  }
}

/** Gera texto e informa qual modelo respondeu (o configurado ou uma reserva). */
export async function gerarComGeminiDetalhado(messages: ChatMessage[], opts: Opcoes = {}): Promise<{ texto: string; modelo: string }> {
  const { apiKey, modelos } = await credenciais("gemini.model", MODELO_PADRAO, RESERVAS);
  return comReservas(modelos, async (modelo) => ({ texto: await chamar(modelo, apiKey, messages, opts), modelo }));
}

/**
 * Resposta em tempo real (streaming), como no app do Gemini. Se um modelo cair no meio da resposta,
 * `aoReiniciar` limpa o texto parcial e o próximo modelo da lista responde do zero.
 */
export async function transmitirComGemini(
  messages: ChatMessage[],
  opts: Opcoes,
  aoReceber: (trecho: string) => void,
  aoReiniciar: () => void,
): Promise<{ texto: string; modelo: string; fontes: Fonte[] }> {
  const { apiKey, modelos } = await credenciais("gemini.model", MODELO_PADRAO, RESERVAS);
  return comReservas(modelos, async (modelo) => {
    const ctrl = new AbortController();
    let relogio = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
    let texto = "";
    const fontes: Fonte[] = [];
    try {
      const res = await requisitar(modelo, apiKey, "streamGenerateContent?alt=sse", corpo(modelo, messages, opts), ctrl.signal);
      const leitor = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        // Sem novidade por 20 s = modelo travado.
        clearTimeout(relogio);
        relogio = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
        resto += value;
        const linhas = resto.split(/\r?\n/);
        resto = linhas.pop() ?? "";
        for (const l of linhas) {
          if (!l.startsWith("data:")) continue;
          const data = JSON.parse(l.slice(5)) as Resposta;
          if (data.error) throw new Indisponivel(`${modelo}: ${data.error.message}`);
          fontesDe(data, fontes);
          const t = textoDe(data);
          if (t) {
            texto += t;
            aoReceber(t);
          }
        }
      }
      if (!texto) throw new Indisponivel(`${modelo} não retornou conteúdo`);
      return { texto, modelo, fontes };
    } catch (e) {
      if (texto) aoReiniciar();
      if (e instanceof Indisponivel) throw e;
      if ((e as Error).name === "AbortError") throw new Indisponivel(`${modelo} parou de responder`);
      throw e;
    } finally {
      clearTimeout(relogio);
    }
  });
}

export type ImagemGerada = { mimeType: string; data: string };

/** Gera (ou edita, se houver imagens anexadas) imagens com o modelo de imagem do Gemini. */
export async function gerarImagemComGemini(
  messages: ChatMessage[],
  opts: { system?: string; proporcao?: string } = {},
): Promise<{ texto: string; imagens: ImagemGerada[]; modelo: string }> {
  const { apiKey, modelos } = await credenciais("gemini.modeloImagem", MODELO_IMAGEM_PADRAO, RESERVAS_IMAGEM);
  try {
    return await comReservas(modelos, async (modelo) => {
      const res = await requisitar(modelo, apiKey, "generateContent", corpo(modelo, messages, { ...opts, imagem: { proporcao: opts.proporcao } }), AbortSignal.timeout(90_000));
      const data = (await res.json().catch(() => ({}))) as Resposta;
      const partes = data.candidates?.[0]?.content?.parts ?? [];
      const imagens = partes.filter((p) => p.inlineData && !p.thought).map((p) => p.inlineData!);
      const texto = partes.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      if (!imagens.length && !texto) {
        const motivo = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason;
        if (motivo) throw new Error(`O Gemini recusou gerar esta imagem (${motivo}). Reformule o pedido.`);
        throw new Indisponivel(`${modelo} não retornou imagem`);
      }
      return { texto, imagens, modelo };
    });
  } catch (e) {
    if (e instanceof FalhaGemini && e.falhas.some((f) => /: 429 /.test(f)) && !e.falhas.some((f) => /: 503 /.test(f))) {
      throw new Error(
        "Sua chave do Gemini não tem cota para gerar imagens (erro 429: o plano gratuito normalmente não inclui modelos de imagem). Ative o faturamento em aistudio.google.com › Billing ou use outra chave em Configurações › Integrações.",
      );
    }
    throw e;
  }
}

export async function gerarComGemini(messages: ChatMessage[], opts: Opcoes = {}): Promise<string> {
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
