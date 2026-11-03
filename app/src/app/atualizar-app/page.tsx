import { Download, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appDesatualizado } from "@/lib/app-android";

export const metadata: Metadata = { title: "Atualize o app" };

// Tela do app antigo: bloqueia o uso até instalar a versão nova (o download não precisa de login).
export default async function AtualizarAppPage() {
  const v = await appDesatualizado((await headers()).get("user-agent"));
  if (!v) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar p-6 text-center text-white">
      <div className="grid max-w-sm justify-items-center gap-4">
        <span className="grid size-20 place-items-center rounded-3xl bg-[#d4af37]/15 text-[#e6c158]">
          <Smartphone className="size-11" />
        </span>
        <h1 className="font-display text-2xl font-extrabold">Atualize o app</h1>
        <p className="text-[#c9d6e8]">
          Você está na versão <strong className="text-white">{v.usada}</strong> e a atual é a <strong className="text-[#e6c158]">{v.ultima}</strong>. Para continuar usando o sistema, instale a
          versão nova.
        </p>
        <a href="/baixar/android" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#e6c158] px-6 font-bold text-[#0a1a33] shadow-lg">
          <Download className="size-5" /> Baixar versão {v.ultima}
        </a>
        <ol className="grid gap-1 text-left text-sm text-[#c9d6e8]">
          <li>1. Toque em Baixar e espere o download terminar.</li>
          <li>2. Abra o arquivo baixado e toque em Atualizar (seus dados e login continuam).</li>
          <li>3. Abra o app de novo.</li>
        </ol>
      </div>
    </main>
  );
}
