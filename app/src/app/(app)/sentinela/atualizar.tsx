"use client";

import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Enquanto a coleta/relatório roda, só pergunta ao servidor se já acabou (não recarrega a página, para não atrapalhar a leitura).
 * Quando acaba, aparece um botão para ver o resultado.
 */
export function AtualizarSozinho({ ativo, verificar }: { ativo: boolean; verificar: () => Promise<unknown> }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"rodando" | "pronto" | "parado">(ativo ? "rodando" : "parado");
  useEffect(() => setEstado(ativo ? "rodando" : "parado"), [ativo]);
  useEffect(() => {
    if (estado !== "rodando") return;
    const t = setInterval(async () => {
      const r = await verificar().catch(() => "erro" as const);
      if (r === null) setEstado("pronto");
    }, 10_000);
    return () => clearInterval(t);
  }, [estado, verificar]);
  if (estado === "parado") return null;
  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
      {estado === "rodando" ? (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-gold" /> Trabalhando em segundo plano… pode continuar lendo.
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4 shrink-0 text-green" /> Pronto!
          <button
            type="button"
            onClick={() => {
              setEstado("parado");
              router.refresh();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 font-semibold text-[#0a1a33]"
          >
            <RefreshCw className="size-3.5" /> Ver resultado
          </button>
        </>
      )}
    </div>
  );
}
