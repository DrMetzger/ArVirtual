import { Download, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appDesatualizado } from "@/lib/app-android";
import { BaixarSozinho } from "./baixar-sozinho";

export const metadata: Metadata = { title: "Atualize o app" };

// Tela do app antigo: bloqueia o uso até instalar a versão nova (o download não precisa de login).
export default async function AtualizarAppPage() {
  const v = await appDesatualizado((await headers()).get("user-agent"));
  if (!v) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar p-6 text-center text-white">
      <BaixarSozinho versao={v.ultima} />
      <div className="grid max-w-sm justify-items-center gap-4">
        <span className="grid size-20 place-items-center rounded-3xl bg-[#d4af37]/15 text-[#e6c158]">
          <Smartphone className="size-11" />
        </span>
        <h1 className="font-display text-2xl font-extrabold">Atualize o app</h1>
        <p className="text-[#c9d6e8]">
          Você está na versão <strong className="text-white">{v.usada}</strong> e a atual é a <strong className="text-[#e6c158]">{v.ultima}</strong>. O download já começou: quando
          terminar, o instalador abre sozinho.
        </p>
        <a href="/baixar/android" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#e6c158] px-6 font-bold text-[#0a1a33] shadow-lg">
          <Download className="size-5" /> Baixar de novo (versão {v.ultima})
        </a>
        <ol className="grid gap-1 text-left text-sm text-[#c9d6e8]">
          <li>1. Espere o download (aparece na barra de notificações).</li>
          <li>2. No instalador, toque em Atualizar (seus dados e login continuam). Na primeira vez o Android pede para permitir: permita e volte.</li>
          <li>3. Abra o app de novo.</li>
        </ol>
      </div>
    </main>
  );
}
