import type { Metadata } from "next";
import { Assistente } from "../view";

export const metadata: Metadata = { title: "Assistente IA" };

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Id que não é UUID quebraria a consulta: trata como conversa inexistente.
  return <Assistente id={/^[0-9a-f-]{36}$/i.test(id) ? id : "00000000-0000-0000-0000-000000000000"} />;
}
