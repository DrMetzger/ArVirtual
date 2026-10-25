import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { conversasIa, memoriasIa, mensagensIa } from "@/db/schema";
import { conversaParaTela, paraTela } from "@/lib/assistente/tipos";
import { requireUser } from "@/lib/auth";
import { geminiConfigurado } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import { Chat } from "./chat";

/** Tela do assistente: organizador de conversas + conversa aberta (ou nova). */
export async function Assistente({ id }: { id?: string }) {
  const session = await requireUser();
  if (!(await geminiConfigurado())) {
    return (
      <>
        <PageHeader title="Assistente IA" />
        <Alert tone="gold">
          Cadastre a chave da API Gemini em{" "}
          <Link href="/configuracoes?aba=integracoes" className="font-semibold underline">
            Configurações › Integrações
          </Link>{" "}
          para usar o assistente. A chave é gerada em aistudio.google.com.
        </Alert>
      </>
    );
  }
  const [conversas, aberta, memorias, cfg] = await Promise.all([
    db.select().from(conversasIa).where(eq(conversasIa.usuarioId, session.sub)).orderBy(desc(conversasIa.atualizadoEm)).limit(500),
    id ? db.query.conversasIa.findFirst({ where: and(eq(conversasIa.id, id), eq(conversasIa.usuarioId, session.sub)) }) : null,
    db.$count(memoriasIa, eq(memoriasIa.ativo, true)),
    getSettings(["impressora.modelo", "impressora.bico", "impressora.mesa"]),
  ]);
  if (id && !aberta) notFound();
  const mensagens = aberta ? await db.select().from(mensagensIa).where(eq(mensagensIa.conversaId, aberta.id)).orderBy(asc(mensagensIa.id)) : [];
  return (
    <Chat
      conversas={conversas.map(conversaParaTela)}
      conversaId={aberta?.id ?? null}
      mensagensIniciais={mensagens.map(paraTela)}
      totalMemorias={memorias}
      impressora={`${cfg["impressora.modelo"] || "Bambu Lab A1 mini"} · bico ${cfg["impressora.bico"] || "0,4 mm"} · ${cfg["impressora.mesa"] || "Textured PEI"}`}
    />
  );
}
