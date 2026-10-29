import { ShieldBan } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Aparelho bloqueado" };

// Mostrada quando o celular foi bloqueado em Configurações › Aparelhos.
export default function BloqueadoPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar p-6 text-center text-white">
      <div className="grid max-w-sm justify-items-center gap-3">
        <ShieldBan className="size-14 text-[#ef4b51]" />
        <h1 className="font-display text-2xl font-extrabold">Aparelho bloqueado</h1>
        <p className="text-[#c9d6e8]">Este celular não tem mais acesso ao sistema. Se foi engano, fale com o administrador para liberar.</p>
      </div>
    </main>
  );
}
