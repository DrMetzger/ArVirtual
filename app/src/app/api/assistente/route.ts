import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversasIa, memoriasIa, mensagensIa, type AnexoIa, type MensagemIa } from "@/db/schema";
import { parteDoAnexo, salvarAnexo, salvarImagemGerada } from "@/lib/assistente/arquivos";
import { extrairMemorias, montarSistema } from "@/lib/assistente/contexto";
import { paraTela } from "@/lib/assistente/tipos";
import { requireUser } from "@/lib/auth";
import { gerarComGemini, gerarImagemComGemini, transmitirComGemini, type ChatMessage, type Parte } from "@/lib/gemini";
import { getSetting } from "@/lib/settings";

const PROPORCOES = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const ORCAMENTO_INLINE = 14 * 1024 * 1024; // bytes de imagem/PDF reenviados ao Gemini por pedido
const PEDIDO_IMAGEM = /\b(gere|gera|gerar|crie|cria|criar|fa[çc]a|desenhe|desenha|monte)\b.{0,40}\b(imagem|imagens|foto|fotos|figura|ilustra[çc][ãa]o|logo|logotipo|banner|arte|mockup)\b/i;

const SISTEMA_IMAGEM = `Você cria imagens para a ArVirtual, que vende peças impressas em 3D (Bambu Lab A1 mini) no Mercado Livre, Shopee e Magalu.
Para fotos de produto: fundo limpo (branco ou neutro, a menos que peçam cenário), iluminação de estúdio suave, foco nítido, sem texto, marcas d'água ou logotipos de terceiros.
Quando houver foto anexada, preserve fielmente a peça (formato, cor, textura de camadas da impressão 3D) e mude apenas o que foi pedido.
Responda com a imagem e uma frase curta em português descrevendo o que foi feito.`;

const ehInline = (a: AnexoIa) => a.texto === undefined;

/** Histórico no formato do Gemini: turnos alternados, imagens/PDF recentes reenviados até o limite. */
async function montarHistorico(msgs: MensagemIa[]): Promise<ChatMessage[]> {
  let orcamento = ORCAMENTO_INLINE;
  const saida: ChatMessage[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    const partes: Parte[] = [];
    for (const a of m.anexos) {
      // Imagens geradas pela IA voltam só como referência (o modo texto não precisa delas).
      const inline = m.papel === "user" && ehInline(a) && a.tamanho * 1.37 <= orcamento;
      if (inline) orcamento -= a.tamanho * 1.37;
      partes.push(m.papel === "model" ? { text: `[Imagem gerada: ${a.nome}]` } : await parteDoAnexo(a, inline));
    }
    const ultimo = saida[0];
    if (ultimo && ultimo.role === m.papel) {
      // Duas mensagens seguidas do mesmo lado (ex.: resposta que falhou): junta num turno só.
      ultimo.partes = [...partes, ...(m.texto ? [{ text: m.texto }] : []), ...(ultimo.partes ?? [])];
    } else {
      saida.unshift({ role: m.papel, text: m.texto, partes });
    }
  }
  while (saida[0]?.role === "model") saida.shift();
  return saida;
}

function tituloProvisorio(texto: string, anexos: AnexoIa[]) {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t) return t.length > 60 ? `${t.slice(0, 57)}...` : t;
  return anexos[0]?.nome ?? "Nova conversa";
}

export async function POST(req: Request) {
  const session = await requireUser();
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ erro: "Pedido inválido." }, { status: 400 });

  const regenerar = form.get("regenerar") === "1";
  const texto = String(form.get("texto") ?? "").trim().slice(0, 30_000);
  const pesquisa = form.get("pesquisa") === "1";
  const proporcao = PROPORCOES.includes(String(form.get("proporcao"))) ? String(form.get("proporcao")) : undefined;
  const arquivos = form.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  let modo = form.get("modo") === "imagem" ? "imagem" : "texto";
  if (modo === "texto" && PEDIDO_IMAGEM.test(texto.slice(0, 200))) modo = "imagem";
  if (!regenerar && !texto && !arquivos.length) return Response.json({ erro: "Escreva uma mensagem ou anexe um arquivo." }, { status: 400 });
  if (arquivos.length > 10) return Response.json({ erro: "Envie até 10 arquivos por mensagem." }, { status: 400 });

  // Conversa: a informada (do próprio usuário) ou uma nova.
  const idInformado = String(form.get("conversa") ?? "");
  let conversa = idInformado
    ? await db.query.conversasIa.findFirst({ where: and(eq(conversasIa.id, idInformado), eq(conversasIa.usuarioId, session.sub)) })
    : undefined;
  if (idInformado && !conversa) return Response.json({ erro: "Conversa não encontrada." }, { status: 404 });

  let anexos: AnexoIa[] = [];
  try {
    for (const f of arquivos) anexos.push(await salvarAnexo(f));
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 400 });
  }

  const nova = !conversa;
  if (!conversa) {
    if (regenerar) return Response.json({ erro: "Nada para regenerar." }, { status: 400 });
    [conversa] = await db.insert(conversasIa).values({ usuarioId: session.sub, titulo: tituloProvisorio(texto, anexos) }).returning();
  }
  const conversaId = conversa!.id;

  let mensagemUsuario: MensagemIa | undefined;
  if (regenerar) {
    // Refaz a última resposta: apaga a resposta anterior (se houver) e responde de novo à última pergunta.
    const ultima = await db.query.mensagensIa.findFirst({ where: eq(mensagensIa.conversaId, conversaId), orderBy: desc(mensagensIa.id) });
    if (ultima?.papel === "model") await db.delete(mensagensIa).where(eq(mensagensIa.id, ultima.id));
    mensagemUsuario = await db.query.mensagensIa.findFirst({ where: and(eq(mensagensIa.conversaId, conversaId), eq(mensagensIa.papel, "user")), orderBy: desc(mensagensIa.id) });
    if (!mensagemUsuario) return Response.json({ erro: "Nada para regenerar." }, { status: 400 });
    if (form.get("modo") !== "imagem" && PEDIDO_IMAGEM.test(mensagemUsuario.texto.slice(0, 200))) modo = "imagem";
  } else {
    [mensagemUsuario] = await db.insert(mensagensIa).values({ conversaId, papel: "user", texto, anexos }).returning();
  }

  const historico = await db.select().from(mensagensIa).where(eq(mensagensIa.conversaId, conversaId)).orderBy(desc(mensagensIa.id)).limit(40);
  historico.reverse();

  const enc = new TextEncoder();
  // Se o navegador desconectar (parar/fechar a aba), a resposta continua e é salva, mas não escreve mais no stream.
  let aberto = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      aberto = false;
    },
    async start(controller) {
      const enviar = (ev: Record<string, unknown>) => {
        if (!aberto) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(ev)}\n`));
        } catch {
          aberto = false;
        }
      };
      enviar({ t: "conversa", id: conversaId, titulo: conversa!.titulo, nova });
      enviar({ t: "usuario", mensagem: paraTela(mensagemUsuario!) });
      try {
        let resposta: { texto: string; modelo: string; anexos: AnexoIa[]; fontes: { titulo: string; url: string }[] };
        const aprendidos: string[] = [];

        if (modo === "imagem") {
          enviar({ t: "status", texto: "Criando imagem..." });
          // Edição: as fotos anexadas agora ou a última imagem gerada nesta conversa.
          const anexosAtuais = mensagemUsuario!.anexos.filter((a) => a.tipo.startsWith("image/"));
          const ultimaGerada = [...historico].reverse().find((m) => m.papel === "model" && m.anexos.length)?.anexos.filter((a) => a.tipo.startsWith("image/")) ?? [];
          const base = anexosAtuais.length ? anexosAtuais : ultimaGerada.slice(0, 1);
          const anteriores = historico.filter((m) => m.papel === "user" && m.id !== mensagemUsuario!.id && m.texto).slice(-4).map((m) => `- ${m.texto.slice(0, 300)}`);
          const partes = await Promise.all(base.map((a) => parteDoAnexo(a, true)));
          const pedido = `${anteriores.length ? `Pedidos anteriores nesta conversa (contexto):\n${anteriores.join("\n")}\n\n` : ""}${base.length && !anexosAtuais.length ? "Edite a imagem anexada (a última que você gerou). " : ""}${mensagemUsuario!.texto || "Melhore esta foto de produto para anúncio de marketplace."}`;
          const r = await gerarImagemComGemini([{ role: "user", text: pedido, partes }], { system: SISTEMA_IMAGEM, proporcao });
          const salvas = await Promise.all(r.imagens.map((img, i) => salvarImagemGerada(img, i)));
          resposta = { texto: r.texto || (salvas.length ? "" : "O modelo não devolveu imagem."), modelo: r.modelo, anexos: salvas, fontes: [] };
        } else {
          const sistema = await montarSistema();
          const r = await transmitirComGemini(
            await montarHistorico(historico),
            { system: sistema, pesquisa },
            (trecho) => enviar({ t: "delta", texto: trecho }),
            () => enviar({ t: "reiniciar" }),
          );
          const { texto: limpo, fatos } = extrairMemorias(r.texto);
          if (fatos.length && (await getSetting("ia.aprender")) !== "nao") {
            // Não repete o que já está na memória.
            const conhecidos = new Set((await db.select({ texto: memoriasIa.texto }).from(memoriasIa)).map((m) => m.texto.trim().toLowerCase()));
            const novos = fatos.map((f) => f.slice(0, 500)).filter((f) => !conhecidos.has(f.toLowerCase()));
            if (novos.length) await db.insert(memoriasIa).values(novos.map((texto) => ({ texto, conversaId })));
            aprendidos.push(...novos);
          }
          resposta = { texto: limpo, modelo: r.modelo, anexos: [], fontes: r.fontes.slice(0, 10) };
        }

        const [salva] = await db
          .insert(mensagensIa)
          .values({ conversaId, papel: "model", texto: resposta.texto, anexos: resposta.anexos, fontes: resposta.fontes, modelo: resposta.modelo })
          .returning();
        await db.update(conversasIa).set({ atualizadoEm: new Date() }).where(eq(conversasIa.id, conversaId));
        enviar({ t: "fim", mensagem: paraTela(salva!), memorias: aprendidos });

        if (nova && mensagemUsuario!.texto) {
          // Título curto gerado pela IA (se falhar, fica o começo da pergunta).
          const titulo = await gerarComGemini(
            [{ role: "user", text: `Dê um título curto (máximo 6 palavras, sem aspas nem ponto final) em português para uma conversa que começa com:\n\n${mensagemUsuario!.texto.slice(0, 1500)}` }],
            { system: "Você só responde com o título pedido.", temperature: 0.3 },
          )
            .then((t) => t.replace(/["*#\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70))
            .catch(() => "");
          if (titulo) {
            await db.update(conversasIa).set({ titulo }).where(eq(conversasIa.id, conversaId));
            enviar({ t: "titulo", titulo });
          }
        }
      } catch (e) {
        console.warn(`[assistente] ${(e as Error).message}`);
        enviar({ t: "erro", erro: (e as Error).message });
      } finally {
        if (aberto) {
          try {
            controller.close();
          } catch {
            /* conexão já fechada */
          }
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

/** Mensagens de uma conversa (ao trocar de conversa sem recarregar a página). */
export async function GET(req: Request) {
  const session = await requireUser();
  const id = new URL(req.url).searchParams.get("conversa") ?? "";
  const conversa = await db.query.conversasIa.findFirst({ where: and(eq(conversasIa.id, id), eq(conversasIa.usuarioId, session.sub)) });
  if (!conversa) return Response.json({ erro: "Conversa não encontrada." }, { status: 404 });
  const msgs = await db.select().from(mensagensIa).where(eq(mensagensIa.conversaId, id)).orderBy(asc(mensagensIa.id));
  return Response.json({ mensagens: msgs.map(paraTela) });
}
