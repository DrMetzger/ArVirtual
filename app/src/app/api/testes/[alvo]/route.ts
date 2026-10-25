import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";
import { gerarComGeminiDetalhado, gerarImagemComGemini } from "@/lib/gemini";
import { layoutEmail, paragrafo } from "@/lib/email-layout";
import { enviarEmail } from "@/lib/mail";
import { statusSefaz } from "@/lib/nfe/emissor";

// Testes de integração de Configurações. Ficam fora das server actions porque o Next executa as
// ações de uma página em fila: um teste lento (Gemini, SEFAZ) travava o "Salvar" dos outros cartões.
export async function POST(req: Request, { params }: { params: Promise<{ alvo: string }> }) {
  try {
    const alvo = (await params).alvo;
    if (alvo === "gemini") {
      await requireUser();
      const { texto, modelo } = await gerarComGeminiDetalhado([{ role: "user", text: "Responda apenas: OK, conectado." }], { temperature: 0 });
      return Response.json({ ok: `Gemini (${modelo}) respondeu: ${texto.trim().slice(0, 80)}` });
    }
    if (alvo === "gemini-imagem") {
      await requireUser();
      const r = await gerarImagemComGemini([{ role: "user", text: "Um pequeno cubo de calibração impresso em 3D em PLA azul, fundo branco." }], { proporcao: "1:1" });
      if (!r.imagens.length) return Response.json({ erro: `${r.modelo} respondeu sem imagem: ${r.texto.slice(0, 120)}` });
      return Response.json({ ok: `Geração de imagens funcionando (${r.modelo}).` });
    }
    if (alvo === "sefaz") {
      await requireAdmin();
      const r = await statusSefaz();
      const msg = `SEFAZ ${r.uf} (${r.ambiente === "producao" ? "produção" : "homologação"}): ${r.mensagem}`;
      return Response.json(r.online ? { ok: msg } : { erro: msg });
    }
    if (alvo === "email") {
      const session = await requireUser();
      const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, session.sub) });
      if (!user) throw new Error("Usuário não encontrado.");
      await enviarEmail({
        contaId: Number(new URL(req.url).searchParams.get("conta")),
        para: user.email,
        assunto: "Teste de e-mail · ArVirtual",
        html: layoutEmail({
          titulo: "Teste de e-mail",
          resumo: "Esta conta de e-mail está configurada no sistema ArVirtual.",
          corpo: paragrafo("Tudo certo! Esta conta de e-mail está configurada e enviando mensagens do sistema ArVirtual."),
        }),
      });
      return Response.json({ ok: `E-mail de teste enviado para ${user.email}.` });
    }
    return Response.json({ erro: "Teste desconhecido." }, { status: 404 });
  } catch (e) {
    return Response.json({ erro: (e as Error).message });
  }
}
