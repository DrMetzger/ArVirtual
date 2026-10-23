import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { geminiConfigurado } from "@/lib/gemini";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Assistente IA" };

export default async function AssistentePage() {
  await requireUser();
  const ok = await geminiConfigurado();
  return (
    <>
      <PageHeader title="Assistente IA" description="Google Gemini treinado no contexto da ArVirtual: anúncios, preços, fiscal, ESP32 e Protheus." />
      {ok ? (
        <Chat />
      ) : (
        <Alert tone="gold">
          Cadastre a chave da API Gemini em{" "}
          <Link href="/configuracoes?aba=integracoes" className="font-semibold underline">
            Configurações › Integrações
          </Link>{" "}
          para usar o assistente. A chave é gerada em aistudio.google.com.
        </Alert>
      )}
    </>
  );
}
