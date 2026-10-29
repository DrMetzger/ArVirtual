import { Download, Smartphone } from "lucide-react";
import Image from "next/image";
import type { InfoApp } from "@/lib/app-android";
import { cn } from "@/lib/utils";

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Cartão "Baixe o app Android" (tela de login e Configurações). */
export function BaixarApp({ info, className }: { info: InfoApp; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border border-border bg-surface p-4", className)}>
      <Image src="/app-android.png" alt="" width={56} height={56} className="shrink-0 rounded-[14px] shadow-md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Smartphone className="size-4 text-gold" /> App ArVirtual para Android
        </p>
        <p className="text-xs text-muted">
          Versão {info.versao}
          {info.tamanho ? ` · ${mb(info.tamanho)}` : ""}
        </p>
        <a href="/baixar/android" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-[#0a1a33] hover:brightness-110">
          <Download className="size-3.5" /> Baixar o app
        </a>
      </div>
    </div>
  );
}
